// src/adapters/llm.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export type DraftOptions = {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  knowledgeBase?: string[]; // Snippets to ground the response
  requireCitations?: boolean;
};

export type DraftResult = {
  text: string;
  confidence: number;
  snippetsUsed: string[];
  tokensUsed: number;
  cacheHit: boolean;
  flagged: boolean;
  flagReason?: string;
};

// Cost tracking
let totalTokensUsed = 0;
let cacheHitsCount = 0;

export async function draftWithLLM(opts: DraftOptions): Promise<DraftResult> {
  const {
    systemPrompt,
    userMessage,
    maxTokens = 500,
    temperature = 0.3, // Lower temp reduces hallucinations
    knowledgeBase = [],
    requireCitations = true,
  } = opts;

  // Build grounded context
  const knowledgeContext = knowledgeBase.length > 0
    ? `\n\nAvailable Knowledge Base:\n${knowledgeBase.map((s, i) => `[${i}] ${s}`).join('\n\n')}`
    : '';

  const fullSystemPrompt = `${systemPrompt}${knowledgeContext}

CRITICAL RULES:
- You must ONLY use information from the Knowledge Base above
- If you reference a knowledge base item, cite it as [KB:N] where N is the index
- If the knowledge base doesn't contain the answer, say "I don't have enough information to answer this. Let me escalate to a specialist."
- Never make up information, policies, or commitments
- Never promise refunds, discounts, or SLA guarantees unless explicitly stated in the knowledge base
${requireCitations ? '- You MUST include citations [KB:N] for every factual claim' : ''}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      system: [
        {
          type: 'text',
          text: fullSystemPrompt,
          cache_control: { type: 'ephemeral' }, // Cache system prompt
        },
      ],
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    // Track usage
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    totalTokensUsed += tokensUsed;
    
    const cacheHit = (response.usage as any).cache_read_input_tokens > 0;
    if (cacheHit) cacheHitsCount++;

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract citations
    const citationMatches = text.match(/\[KB:\d+\]/g) || [];
    const snippetsUsed = [...new Set(citationMatches.map(c => c.match(/\d+/)?.[0] || ''))];

    // Validate output
    const validation = validateDraft(text, knowledgeBase, requireCitations);

    // Calculate confidence based on multiple factors
    const confidence = calculateConfidence({
      hasEscalationPhrase: text.toLowerCase().includes("don't have enough information"),
      citationCount: snippetsUsed.length,
      lengthAppropriate: text.length >= 50 && text.length <= 1000,
      noRedFlags: !validation.flagged,
      temperature,
    });

    return {
      text,
      confidence,
      snippetsUsed,
      tokensUsed,
      cacheHit,
      flagged: validation.flagged,
      flagReason: validation.reason,
    };
  } catch (error: any) {
    // Handle API errors gracefully
    if (error.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    if (error.status >= 500) {
      throw new Error('LLM_SERVICE_ERROR');
    }
    throw error;
  }
}

function validateDraft(
  text: string,
  knowledgeBase: string[],
  requireCitations: boolean
): { flagged: boolean; reason?: string } {
  const lower = text.toLowerCase();

  // Red flag phrases that indicate hallucination or overcommitment
  const redFlags = [
    'guarantee',
    'we promise',
    'definitely will',
    'immediately refund',
    'free upgrade',
    'waive all fees',
    'legal liability',
    'sue us',
    'within 24 hours', // Unless in KB
    'full refund no questions asked', // Unless in KB
  ];

  for (const flag of redFlags) {
    if (lower.includes(flag)) {
      // Check if it's actually in the knowledge base
      const inKB = knowledgeBase.some(kb => kb.toLowerCase().includes(flag));
      if (!inKB) {
        return { flagged: true, reason: `Contains red flag phrase: "${flag}"` };
      }
    }
  }

  // Check for required citations
  if (requireCitations && knowledgeBase.length > 0) {
    const hasCitations = /\[KB:\d+\]/.test(text);
    if (!hasCitations && !lower.includes("don't have enough information")) {
      return { flagged: true, reason: 'Missing required citations' };
    }
  }

  // Check for hallucinated data patterns
  const hallucinations = [
    /order #?\d{8,}/i, // Specific order numbers
    /ticket #?\d{6,}/i, // Ticket IDs
    /\$\d+\.\d{2} refund/i, // Specific dollar amounts
    /tracking: [A-Z0-9]{15,}/i, // Tracking numbers
  ];

  for (const pattern of hallucinations) {
    if (pattern.test(text)) {
      const inKB = knowledgeBase.some(kb => pattern.test(kb));
      if (!inKB) {
        return { flagged: true, reason: 'Contains specific data not in knowledge base' };
      }
    }
  }

  return { flagged: false };
}

function calculateConfidence(factors: {
  hasEscalationPhrase: boolean;
  citationCount: number;
  lengthAppropriate: boolean;
  noRedFlags: boolean;
  temperature: number;
}): number {
  if (factors.hasEscalationPhrase) return 0.95; // High confidence in escalation

  let score = 0.5;

  if (factors.citationCount > 0) score += 0.2;
  if (factors.citationCount > 2) score += 0.1;
  if (factors.lengthAppropriate) score += 0.1;
  if (factors.noRedFlags) score += 0.1;
  if (factors.temperature < 0.5) score += 0.05;

  return Math.min(0.99, score);
}

// Cost monitoring utilities
export function getCostMetrics() {
  // Claude pricing (approximate)
  const inputCostPer1M = 3.0; // $3/M tokens
  const outputCostPer1M = 15.0; // $15/M tokens
  const cacheCostPer1M = 0.3; // $0.30/M tokens (90% savings)

  // Simplified: assume 60/40 split input/output
  const estimatedInputTokens = totalTokensUsed * 0.6;
  const estimatedOutputTokens = totalTokensUsed * 0.4;

  const cost = 
    (estimatedInputTokens / 1_000_000) * inputCostPer1M +
    (estimatedOutputTokens / 1_000_000) * outputCostPer1M;

  const cacheRate = cacheHitsCount / Math.max(1, cacheHitsCount + 1);

  return {
    totalTokens: totalTokensUsed,
    estimatedCost: cost.toFixed(4),
    cacheHitRate: (cacheRate * 100).toFixed(1) + '%',
    cacheHits: cacheHitsCount,
  };
}

export function resetCostMetrics() {
  totalTokensUsed = 0;
  cacheHitsCount = 0;
}