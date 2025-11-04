import { z } from 'zod';

export const ReplyRequest = z.object({
  messageId: z.string().min(1),
  threadId: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  minConfidence: z.number().min(0).max(1).optional(),
  tone: z.enum(['friendly', 'formal', 'concise', 'supportive']).optional(),
  templateId: z.enum(['refund-inquiry', 'shipping-delay', 'account-access']).optional()
});
export type ReplyRequest = z.infer<typeof ReplyRequest>;