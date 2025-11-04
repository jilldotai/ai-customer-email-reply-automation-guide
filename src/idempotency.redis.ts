import { createClient } from 'redis';

export function redisSendLog(url = process.env.REDIS_URL!) {
  const client = createClient({ url });
  let ready = false;
  async function ensure() { if (!ready) { await client.connect(); ready = true; } }
  return {
    async has(key: string) { await ensure(); const ttl = await client.ttl(key); return ttl !== -2; },
    async put(key: string, ttlSec = 900) { await ensure(); await client.set(key, '1', { EX: ttlSec, NX: true }); },
    async close() { if (ready) await client.quit(); }
  };
}