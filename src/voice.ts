export const brandStyle = {
  tone: 'friendly',
  formality: 'neutral',
  empathyLevel: 'medium',
  signature: '— The Support Team',
  bannedPhrases: ['guarantee', 'legal liability', 'we will refund immediately', 'we promise'],
};

export const fewShots = [
  { context: 'Refund location', reply: 'Thanks for reaching out. You can request a refund from your Billing page under “Refunds”. If you don’t see the option, reply with your order number and we’ll help. — The Support Team' },
  { context: 'Shipping delay', reply: 'Thanks for checking in. Live tracking is on your Orders page. If the order is 48 hours past ETA, reply with your order number and we’ll escalate. — The Support Team' },
  { context: 'Account access', reply: 'If you’re locked out, use “Forgot password.” For SSO, contact your workspace admin. If you still can’t access, reply with your account email and we’ll assist. — The Support Team' }
];