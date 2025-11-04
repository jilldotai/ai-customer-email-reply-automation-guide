export type Log = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
};
export function logger(): Log {
  function base(level: 'info'|'error', msg: string, meta?: Record<string, unknown>) {
    const rec = { level, msg, t: new Date().toISOString(), ...meta };
    try { (console as any)[level](JSON.stringify(rec)); } catch { (console as any)[level](msg); }
  }
  return {
    info: (m, meta) => base('info', m, meta),
    error: (m, meta) => base('error', m, meta),
  };
}