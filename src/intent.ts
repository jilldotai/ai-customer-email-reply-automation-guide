export type Intent = 'refund-inquiry' | 'shipping-delay' | 'account-access' | null;

const refundKeywords = ['refund', 'chargeback', 'return', 'money back'];
const shippingKeywords = ['delay', 'late', 'tracking', 'shipping', 'lost'];
const accessKeywords = ['reset', 'password', 'login', 'sign in', 'locked', '2fa', 'account access'];

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (refundKeywords.some(k => t.includes(k))) return 'refund-inquiry';
  if (shippingKeywords.some(k => t.includes(k))) return 'shipping-delay';
  if (accessKeywords.some(k => t.includes(k))) return 'account-access';
  return null;
}

export function extractOrderNumber(text: string): string | null {
  const m = text.match(/(?:ord[-\s:]*)?([a-z0-9]{3,}-\d{3,}|\#?\d{4,})/i);
  return m ? m[1].replace(/^#/, '') : null;
}

export function extractTrackingId(text: string): string | null {
  const m = text.match(/\b(1Z[0-9A-Z]{10,18}|[A-Z]{2}\d{9}[A-Z]{2}|\d{12,})\b/);
  return m ? m[1] : null;
}

export type DeptEmails = { billing: string; logistics: string; admin: string; complaints: string };

export function getDeptEmails(): DeptEmails {
  return {
    billing: process.env.BILLING_EMAIL || 'accounts@domain.com',
    logistics: process.env.LOGISTICS_EMAIL || 'logistics@domain.com',
    admin: process.env.ADMIN_EMAIL || 'admin@domain.com',
    complaints: process.env.COMPLAINTS_EMAIL || 'complaints@domain.com',
  };
}