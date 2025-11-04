import { createHash } from 'crypto';

export function hashKey(parts: Record<string, string | number | boolean>): string {
  const raw = Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&');
  return createHash('sha256').update(raw).digest('hex');
}

export type SendLog = {
  has: (key: string) => Promise<boolean>;
  put: (key: string, ttlSec?: number) => Promise<void>;
};

export async function guardSend(
  log: SendLog,
  msg: { messageId: string; threadId: string; replyText: string },
  ttlSec = 900
) {
  const key = hashKey({
    messageId: msg.messageId,
    threadId: msg.threadId,
    replyHash: hashKey({ t: msg.replyText }),
  });
  if (await log.has(key)) return { skipped: true } as const;
  await log.put(key, ttlSec);
  return { skipped: false, key } as const;
}

export function memSendLog(): SendLog {
  const m = new Map<string, number>();
  const nowSec = () => Math.floor(Date.now() / 1000);
  const sweep = () => { const t = nowSec(); for (const [k, exp] of m) if (exp <= t) m.delete(k); };
  return {
    async has(key) { sweep(); const exp = m.get(key); return !!exp && exp > nowSec(); },
    async put(key, ttlSec = 900) { sweep(); m.set(key, nowSec() + ttlSec); },
  };
}