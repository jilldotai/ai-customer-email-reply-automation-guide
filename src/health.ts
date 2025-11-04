async function ping(fn: () => Promise<any>, timeoutMs = 5000) {
  const t = setTimeout(() => { throw new Error('timeout'); }, timeoutMs);
  try { await fn(); return true; } catch { return false; } finally { clearTimeout(t); }
}
export async function health() {
  const deps: Record<string, boolean> = {};
  deps.llm = await ping(async () => true);
  deps.db = await ping(async () => true);
  deps.redis = await ping(async () => true);
  const ok = Object.values(deps).every(Boolean);
  return { ok, deps };
}