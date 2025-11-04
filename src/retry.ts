export type RetryOpts = {
  tries?: number;
  baseMs?: number;
  factor?: number;
  jitter?: boolean;
  maxDelayMs?: number;
  isRetryable?: (e: any) => boolean;
  getRetryAfterMs?: (e: any) => number | undefined;
};

export async function retry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const {
    tries = 5,
    baseMs = 400,
    factor = 2,
    jitter = true,
    maxDelayMs = 20_000,
    isRetryable = (e) => {
      const s = Number((e && (e.status || e.code)) ?? 0);
      const msg = String((e as any)?.message || e);
      return s === 429 || (s >= 500 && s < 600) || /ECONNRESET|ETIMEDOUT|rate|timeout/i.test(msg);
    },
    getRetryAfterMs = (e) => {
      const h = (e as any)?.headers?.['retry-after'] ?? (e as any)?.headers?.['Retry-After'];
      if (!h) return undefined;
      const n = Number(h);
      return Number.isFinite(n) ? n * 1000 : undefined;
    },
  } = opts;

  let attempt = 0;
  let lastErr: any;
  while (attempt < tries) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || attempt === tries - 1) break;
      const retryAfter = getRetryAfterMs(e);
      const exp = Math.min(baseMs * Math.pow(factor, attempt), maxDelayMs);
      const delay = retryAfter ?? (jitter ? exp * (0.5 + Math.random()) : exp);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
  throw lastErr;
}

export function circuitBreaker<T>(
  fn: (...args: any[]) => Promise<T>,
  opts: { failThreshold?: number; coolDownMs?: number } = {}
) {
  const failThreshold = opts.failThreshold ?? 5;
  const coolDownMs = opts.coolDownMs ?? 30_000;
  let failures = 0;
  let openUntil = 0;
  return async (...args: any[]): Promise<T> => {
    const now = Date.now();
    if (now < openUntil) throw new Error('CIRCUIT_OPEN');
    try {
      const res = await fn(...args);
      failures = 0;
      return res;
    } catch (e) {
      failures++;
      if (failures >= failThreshold) {
        openUntil = now + coolDownMs;
        failures = 0;
      }
      throw e;
    }
  };
}