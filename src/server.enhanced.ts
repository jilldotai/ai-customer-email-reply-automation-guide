import Fastify from 'fastify';
import { retry, circuitBreaker } from './retry.js';
import { redisSendLog } from './idempotency.redis.js';
import { guardSend } from './idempotency.js';
import { health } from './health.js';
import { prisma } from './db.js';
import { draftWithLLM, getCostMetrics } from './adapters/llm.mock.js';
import { gmailSendDraftAsReply, gmailForwardToDept } from './adapters/gmail.js';
import { loadConfig } from './config.js';
import { logger } from './logging.js';
import { ReplyRequest } from './validation.js';
import { detectIntent, extractOrderNumber, extractTrackingId, getDeptEmails } from './intent.js';
import { knowledgeManager } from './knowledge.js';
import { buildSystemPrompt } from './prompts.js';

const cfg = loadConfig();
const log = logger();
const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });

// Rate limiting: track requests per user/thread
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // requests per hour per thread
const RATE_WINDOW = 3600 * 1000; // 1 hour

function checkRateLimit(threadId: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(threadId);

  if (!entry || entry.resetAt < now) {
    rateLimiter.set(threadId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// Dead letter queue for failed messages
const deadLetterQueue: Array<{
  messageId: string;
  threadId: string;
  prompt: string;
  error: string;
  timestamp: Date;
}> = [];

function addToDeadLetterQueue(item: {
  messageId: string;
  threadId: string;
  prompt: string;
  error: string;
}) {
  deadLetterQueue.push({ ...item, timestamp: new Date() });
  log.error('Message added to DLQ', item);
  
  // In production: persist to database and alert on-call
  if (deadLetterQueue.length > 100) {
    log.error('DLQ threshold exceeded', { count: deadLetterQueue.length });
  }
}

app.addHook('onRequest', async (_req, res) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
});

const sendLog = redisSendLog(process.env.REDIS_URL);

// Wrap LLM with retry + circuit breaker
const safeLLM = circuitBreaker(
  (opts: DraftOptions) => retry(() => draftWithLLM(opts), {
    tries: 3,
    baseMs: 1000,
    isRetryable: (e) => {
      const msg = String(e?.message || e);
      return msg.includes('RATE_LIMITED') || msg.includes('LLM_SERVICE_ERROR');
    },
  })
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

// Admin endpoint: view cost metrics
app.get('/admin/metrics', async () => {
  const metrics = getCostMetrics();
  const recent = await prisma.reply.findMany({
    where: { sentAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    select: { outcome: true, confidence: true },
  });

  const escalationRate = recent.filter(r => r.outcome === 'escalated').length / Math.max(1, recent.length);
  const avgConfidence = recent.reduce((sum, r) => sum + r.confidence, 0) / Math.max(1, recent.length);

  return {
    ...metrics,
    last24Hours: {
      total: recent.length,
      escalationRate: (escalationRate * 100).toFixed(1) + '%',
      avgConfidence: avgConfidence.toFixed(2),
    },
    dlqSize: deadLetterQueue.length,
  };
});

// Admin endpoint: view DLQ
app.get('/admin/dlq', async () => {
  return {
    count: deadLetterQueue.length,
    items: deadLetterQueue.slice(0, 50), // Last 50
  };
});

app.post('/reply', async (req, res) => {
  const parsed = ReplyRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.code(400).send({ 
      error: 'invalid_request', 
      details: parsed.error.flatten() 
    });
  }

  const { messageId, threadId, prompt, minConfidence = 0.8 } = parsed.data;

  // Rate limiting
  if (!checkRateLimit(threadId)) {
    log.info('Rate limit exceeded', { threadId });
    return res.code(429).send({ 
      error: 'rate_limited',
      message: 'Too many requests for this conversation. Please try again later.' 
    });
  }

  const dept = getDeptEmails();
  let replyText: string | null = null;
  let outcome: 'sent' | 'escalated' | 'skipped' = 'sent';
  let confidence = 0.0;
  let snippetsUsed: string[] = [];

  try {
    // Step 1: Detect intent
    const intent = detectIntent(prompt);
    log.info('Intent detected', { messageId, intent });

    // Step 2: Check for escalation rules FIRST (cost-free)
    const escalationRule = knowledgeManager.checkEscalation(prompt, intent || undefined);
    
    if (escalationRule) {
      log.info('Escalation rule triggered', { rule: escalationRule.id });

      // Check if we have required data
      const hasRequiredData = escalationRule.requiresData?.every(field => {
        if (field === 'orderNumber') return extractOrderNumber(prompt);
        if (field === 'trackingNumber') return extractTrackingId(prompt);
        if (field === 'email') return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(prompt);
        return false;
      });

      if (hasRequiredData) {
        // Auto-escalate with department-specific message
        const metadata = {
          orderNumber: extractOrderNumber(prompt),
          trackingNumber: extractTrackingId(prompt),
          email: prompt.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0],
        };

        const deptEmail = dept[escalationRule.department as keyof typeof dept];
        const fwdBody = `AUTO-ESCALATION: ${escalationRule.id}\n\nMetadata:\n${JSON.stringify(metadata, null, 2)}\n\nOriginal message:\n${prompt}`;
        
        await gmailForwardToDept({ 
          deptEmail, 
          originalSubject: `${escalationRule.category} - Auto`, 
          body: fwdBody 
        });

        replyText = `I've escalated your ${escalationRule.category} inquiry to our ${escalationRule.department} team. ` +
          `They'll respond within ${escalationRule.sla || '48 hours'}. ` +
          `If you don't hear back, forward this thread to ${dept.complaints}.\n\n— The Support Team`;
        
        outcome = 'escalated';
        confidence = 0.95;
      }
    }

    // Step 3: If not escalated, try template/knowledge-based reply (no LLM yet)
    if (!replyText && intent) {
      const relevantSnippets = knowledgeManager.getRelevantSnippets(prompt, intent, 3);
      
      if (relevantSnippets.length > 0) {
        // Check if we can answer with just snippets (no LLM needed - COST SAVINGS)
        const simpleIntent = ['refund-inquiry', 'shipping-delay', 'account-access'].includes(intent);
        
        if (simpleIntent && relevantSnippets.length >= 2) {
          // High-confidence template response
          replyText = formatTemplateResponse(relevantSnippets, intent);
          confidence = 0.85;
          snippetsUsed = relevantSnippets.map(s => s.id);
          log.info('Template response used (no LLM call)', { intent, snippetsUsed });
        }
      }
    }

    // Step 4: If still no reply, call LLM with grounded context
    if (!replyText) {
      const relevantSnippets = knowledgeManager.getRelevantSnippets(prompt, intent || undefined, 5);
      const knowledgeBase = knowledgeManager.formatSnippetsForLLM(relevantSnippets);

      if (knowledgeBase.length === 0) {
        // No relevant knowledge = auto-escalate (prevents hallucination)
        log.info('No relevant knowledge found, escalating', { messageId });
        replyText = `I don't have enough information to answer your question accurately. ` +
          `Let me connect you with a specialist who can help. They'll respond within 24 hours.\n\n— The Support Team`;
        outcome = 'escalated';
        confidence = 0.9;

        await gmailForwardToDept({
          deptEmail: dept.admin,
          originalSubject: 'Manual review needed',
          body: `NO KNOWLEDGE BASE MATCH\n\nCustomer query:\n${prompt}`,
        });
      } else {
        // Call LLM with grounded context
        log.info('Calling LLM with knowledge base', { snippetCount: knowledgeBase.length });
        
        const draftResult = await safeLLM({
          systemPrompt: buildSystemPrompt(),
          userMessage: prompt,
          maxTokens: 400,
          temperature: 0.2, // Very low for factual responses
          knowledgeBase,
          requireCitations: true,
        });

        log.info('LLM draft received', {
          tokensUsed: draftResult.tokensUsed,
          cacheHit: draftResult.cacheHit,
          flagged: draftResult.flagged,
        });

        if (draftResult.flagged) {
          log.error('Draft flagged', { reason: draftResult.flagReason, messageId });
          addToDeadLetterQueue({ 
            messageId, 
            threadId, 
            prompt, 
            error: `Flagged: ${draftResult.flagReason}` 
          });
          return res.code(202).send({ 
            escalated: true, 
            reason: 'quality_check_failed' 
          });
        }

        replyText = draftResult.text;
        confidence = draftResult.confidence;
        snippetsUsed = draftResult.snippetsUsed;

        // Confidence threshold check
        if (confidence < minConfidence) {
          log.info('Confidence too low, escalating', { confidence, minConfidence });
          outcome = 'escalated';
          
          await gmailForwardToDept({
            deptEmail: dept.admin,
            originalSubject: 'Low confidence reply',
            body: `CONFIDENCE: ${confidence}\n\nDraft:\n${replyText}\n\nOriginal:\n${prompt}`,
          });

          replyText = `I want to make sure you get accurate information. ` +
            `I've escalated your inquiry to a specialist who'll respond within 24 hours.\n\n— The Support Team`;
        }
      }
    }

    // Step 5: Idempotency check
    const { skipped } = await guardSend(sendLog, { messageId, threadId, replyText });
    if (skipped) {
      log.info('Duplicate send prevented', { messageId });
      return res.send({ skipped: true });
    }

    // Step 6: Send reply
    const sent = await gmailSendDraftAsReply({ 
      messageId, 
      threadId, 
      replyText 
    });

    // Step 7: Log to database
    await prisma.reply.create({
      data: {
        messageId,
        threadId,
        replyText,
        confidence,
        snippetIds: snippetsUsed,
        outcome: sent.ok ? outcome : 'skipped',
      },
    });

    log.info('Reply processed', { 
      messageId, 
      outcome, 
      confidence, 
      snippetsUsed: snippetsUsed.length 
    });

    return res.send({ 
      ok: sent.ok, 
      outcome, 
      confidence,
      snippetsUsed: snippetsUsed.length,
    });

  } catch (error: any) {
    log.error('Reply processing failed', { 
      messageId, 
      error: String(error),
      stack: error?.stack,
    });

    addToDeadLetterQueue({ messageId, threadId, prompt, error: String(error) });

    if (error.message === 'CIRCUIT_OPEN') {
      return res.code(503).send({ 
        error: 'service_unavailable',
        message: 'AI service temporarily unavailable. Your message has been queued.' 
      });
    }

    return res.code(500).send({ 
      error: 'processing_failed',
      message: 'We could not process your message. A specialist will review it manually.' 
    });
  }
});

// Helper: Format template response from snippets
function formatTemplateResponse(snippets: any[], intent: string): string {
  const intro = 'Thanks for reaching out. ';
  const body = snippets.map(s => s.content).join('\n\n');
  const outro = '\n\nIf you need more help, just reply to this email.\n\n— The Support Team';
  
  return intro + body + outro;
}

const port = Number(cfg.PORT) || 3000;
app.listen({ port, host: '0.0.0.0' }).then(() => {
  log.info('Server started', { port });
}).catch((err) => {
  log.error('startup_failed', { err: String(err) });
  process.exit(1);
});