import Fastify from 'fastify';
import { retry, circuitBreaker } from './retry.js';
import { redisSendLog } from './idempotency.redis.js';
import { guardSend } from './idempotency.js';
import { health } from './health.js';
import { prisma } from './db.js';
import { draftWithLLM } from './adapters/llm.js';
import { gmailSendDraftAsReply, gmailForwardToDept } from './adapters/gmail.js';
import { loadConfig } from './config.js';
import { logger } from './logging.js';
import { ReplyRequest } from './validation.js';
import { detectIntent, extractOrderNumber, extractTrackingId, getDeptEmails } from './intent.js';
import templates from './templates/index.json' with { type: 'json' };
import { brandStyle } from './voice.js';
import { buildSystemPrompt } from './prompts.js';

const cfg = loadConfig();
const log = logger();
const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });

app.addHook('onRequest', async (_req, res) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
});

const sendLog = redisSendLog(process.env.REDIS_URL);
const safeLLM = circuitBreaker((userMessage: string) =>
  retry(() => draftWithLLM({ systemPrompt: buildSystemPrompt(), userMessage }))
);

app.get('/health', async () => health());

app.get('/ready', async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await sendLog.has('ready-check');
    return { ok: true };
  } catch (e) {
    log.error('ready failed', { err: String(e) });
    return { ok: false };
  }
});

function findTemplate(id: string) {
  return (templates as any[]).find(t => t.id === id) || null;
}

app.post('/reply', async (req, res) => {
  const parsed = ReplyRequest.safeParse(req.body);
  if (!parsed.success) return res.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });

  const { messageId, threadId, prompt, minConfidence = 0.7, templateId } = parsed.data;
  const dept = getDeptEmails();

  // 1) Template-first routing
  let chosenTemplateId = templateId || detectIntent(prompt) || null;
  let replyText: string | null = null;

  if (chosenTemplateId) {
    const t = findTemplate(chosenTemplateId);
    if (t) replyText = t.response;
  }

  // 2) Escalation triggers for known intents with identifiers
  const orderNumber = extractOrderNumber(prompt);
  const trackingId = extractTrackingId(prompt);
  if (chosenTemplateId === 'refund-inquiry' && orderNumber) {
    const fwd = `Customer provided order number ${orderNumber}.\n\nOriginal:\n${prompt}`;
    await gmailForwardToDept({ deptEmail: dept.billing, originalSubject: 'Refund case', body: fwd });
    replyText =
      `We’ve escalated your refund request to our Accounts team. Turnaround is 48 hours. ` +
      `If you don’t hear back, forward this thread to ${dept.complaints}.\n${brandStyle.signature}`;
  } else if (chosenTemplateId === 'shipping-delay' && (orderNumber || trackingId)) {
    const idInfo = orderNumber ? `order ${orderNumber}` : `tracking ${trackingId}`;
    const fwd = `Customer provided ${idInfo}.\n\nOriginal:\n${prompt}`;
    await gmailForwardToDept({ deptEmail: dept.logistics, originalSubject: 'Shipping delay', body: fwd });
    replyText =
      `We’ve escalated your delivery issue to Logistics. Turnaround is 48 hours. ` +
      `If you don’t hear back, forward this thread to ${dept.complaints}.\n${brandStyle.signature}`;
  } else if (chosenTemplateId === 'account-access' && /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(prompt)) {
    const email = prompt.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
    const fwd = `Customer account email: ${email}\n\nOriginal:\n${prompt}`;
    await gmailForwardToDept({ deptEmail: dept.admin, originalSubject: 'Account access', body: fwd });
    replyText =
      `We’ve escalated your account access issue to Admin. Turnaround is 48 hours. ` +
      `If you don’t hear back, forward this thread to ${dept.complaints}.\n${brandStyle.signature}`;
  }

  // 3) If no template or no confident path, call LLM
  if (!replyText) {
    const draft = await safeLLM(prompt);
    const candidate = (draft?.text || '').trim();
    if (candidate.length < 10 || candidate.length > 1200) {
      return res.code(202).send({ escalated: true, reason: 'unusable_draft' });
    }
    const confidence = Math.max(0.6, Math.min(0.99, candidate.length / 1200));
    if (confidence < minConfidence) {
      await prisma.reply.create({ data: { messageId, threadId, replyText: candidate, confidence, snippetIds: [], outcome: 'escalated' } });
      return res.code(202).send({ escalated: true });
    }
    replyText = candidate;
  }

  // 4) Idempotency for send
  const { skipped } = await guardSend(sendLog, { messageId, threadId, replyText: replyText || '' });
  if (skipped) return res.send({ skipped: true });

  const sent = await gmailSendDraftAsReply({ messageId, threadId, replyText: replyText || '' });
  await prisma.reply.create({
    data: { messageId, threadId, replyText: replyText || '', confidence: 0.95, snippetIds: [], outcome: sent.ok ? 'sent' : 'skipped' }
  });

  return res.send({ ok: sent.ok });
});

const port = Number(cfg.PORT) || 3000;
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  log.error('startup_failed', { err: String(err) });
  process.exit(1);
});