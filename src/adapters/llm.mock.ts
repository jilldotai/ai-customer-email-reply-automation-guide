// Mock LLM adapter for testing without API key
export async function draftWithLLM(opts: any) {
  await new Promise(r => setTimeout(r, 500)); // Simulate API delay
  
  return {
    text: `Thanks for reaching out. We've received your inquiry and will help you shortly. 
    
Based on your request, here's what we can tell you:
- Our team will review your case within 24 hours
- You can check status anytime in your account
- If urgent, reply to this email

— The Support Team`,
    confidence: 0.85,
    snippetsUsed: ['mock-snippet-1'],
    tokensUsed: 150,
    cacheHit: false,
    flagged: false,
  };
}

export function getCostMetrics() {
  return {
    totalTokens: 1500,
    estimatedCost: '0.0045',
    cacheHitRate: '0%',
    cacheHits: 0,
  };
}

export function resetCostMetrics() {}