import { memSendLog, guardSend } from '../src/idempotency.js';

async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`ok - ${name}`); }
  catch (e) { console.error(`not ok - ${name}:`, e); process.exitCode = 1; }
}

await test('first send proceeds, second is skipped', async () => {
  const log = memSendLog();
  const msg = { messageId: 'm1', threadId: 't1', replyText: 'Hello' };
  const a = await guardSend(log, msg, 60);
  if (a.skipped) throw new Error('first should not skip');
  const b = await guardSend(log, msg, 60);
  if (!b.skipped) throw new Error('second should skip');
});