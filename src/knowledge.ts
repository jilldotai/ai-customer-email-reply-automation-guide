import { readFileSync } from 'fs';
import { join } from 'path';

export type KnowledgeSnippet = {
  id: string;
  category: string;
  keywords: string[];
  content: string;
  priority: number;
  requiresEscalation?: boolean;
  metadata?: Record<string, any>;
};

export type KnowledgeBase = {
  snippets: KnowledgeSnippet[];
  policies: Record<string, string>;
  escalationRules: EscalationRule[];
};

export type EscalationRule = {
  id: string;
  trigger: string; // keyword or pattern
  category: string;
  requiresData?: string[]; // e.g., ['orderNumber', 'email']
  department: string;
  sla?: string;
};

class KnowledgeManager {
  private kb: KnowledgeBase;

  constructor() {
    this.kb = this.loadKnowledgeBase();
  }

  private loadKnowledgeBase(): KnowledgeBase {
    try {
      const path = join(process.cwd(), 'knowledge-base.json');
      const data = readFileSync(path, 'utf-8');
      return JSON.parse(data);
    } catch {
      // Fallback to default knowledge base
      return this.getDefaultKnowledgeBase();
    }
  }

  private getDefaultKnowledgeBase(): KnowledgeBase {
    return {
      snippets: [
        {
          id: 'refund-policy',
          category: 'refund',
          keywords: ['refund', 'money back', 'return'],
          content: 'Our refund policy: Requests must be made within 30 days of purchase. Refunds are processed to the original payment method within 5-7 business days. Digital products are non-refundable after download. To request a refund, go to Settings → Billing → Refunds.',
          priority: 10,
        },
        {
          id: 'refund-processing-time',
          category: 'refund',
          keywords: ['how long', 'when', 'processing'],
          content: 'Refund processing time: Once approved, refunds appear in your account within 5-7 business days. Your bank may take an additional 2-3 days to post the credit.',
          priority: 8,
        },
        {
          id: 'shipping-standard',
          category: 'shipping',
          keywords: ['shipping', 'delivery', 'tracking'],
          content: 'Standard shipping: 5-7 business days. Express: 2-3 business days. Track orders at Orders → Select order → Tracking. If your order is 48 hours past the estimated delivery date, contact us with your order number.',
          priority: 10,
        },
        {
          id: 'shipping-delays',
          category: 'shipping',
          keywords: ['delay', 'late', 'lost'],
          content: 'Shipping delays: Weather, carrier issues, or customs can delay delivery. Check tracking for updates. If 48+ hours overdue, we can file a carrier investigation. This takes 7-10 business days.',
          priority: 9,
        },
        {
          id: 'account-password-reset',
          category: 'account',
          keywords: ['password', 'reset', 'forgot', 'login'],
          content: 'Password reset: Click "Forgot Password" on the login page. Check your email (including spam folder) for the reset link. Link expires in 1 hour. For SSO users, contact your workspace admin.',
          priority: 10,
        },
        {
          id: 'account-locked',
          category: 'account',
          keywords: ['locked', 'suspended', 'disabled'],
          content: 'Account locked: This happens after 5 failed login attempts. Accounts auto-unlock after 30 minutes, or you can use "Forgot Password" to reset immediately. If locked for suspected fraud, contact support with the email address on the account.',
          priority: 9,
        },
        {
          id: 'billing-cycle',
          category: 'billing',
          keywords: ['billing', 'charge', 'subscription'],
          content: 'Billing cycle: Subscriptions renew automatically on the same day each month. You can view upcoming charges at Settings → Billing. Cancel anytime before the renewal date to avoid the next charge.',
          priority: 7,
        },
        {
          id: 'cancellation-policy',
          category: 'billing',
          keywords: ['cancel', 'unsubscribe', 'stop'],
          content: 'Cancellation: Go to Settings → Billing → Cancel Subscription. Cancellation is immediate but you retain access until the end of your current billing period. No refunds for partial months.',
          priority: 9,
        },
        {
          id: 'support-hours',
          category: 'general',
          keywords: ['hours', 'available', 'contact'],
          content: 'Support hours: Email support is available 24/7. Average response time is 4-6 hours. Live chat available Mon-Fri 9am-5pm EST. Phone support for Enterprise customers only.',
          priority: 5,
        },
      ],
      policies: {
        noRefundCommitments: 'Never promise immediate refunds or waive standard policies',
        noSLAGuarantees: 'Never guarantee specific resolution times beyond published SLAs',
        escalateIfUncertain: 'If information is not in the knowledge base, escalate to human',
        dataSecurity: 'Never ask for passwords, credit card numbers, or SSNs in email',
      },
      escalationRules: [
        {
          id: 'refund-high-value',
          trigger: 'refund',
          category: 'refund',
          requiresData: ['orderNumber'],
          department: 'billing',
          sla: '48 hours',
        },
        {
          id: 'shipping-lost-package',
          trigger: 'lost package',
          category: 'shipping',
          requiresData: ['orderNumber', 'trackingNumber'],
          department: 'logistics',
          sla: '48 hours',
        },
        {
          id: 'account-fraud',
          trigger: 'unauthorized charge',
          category: 'fraud',
          requiresData: ['email'],
          department: 'security',
          sla: '24 hours',
        },
        {
          id: 'account-locked-persistent',
          trigger: 'still locked',
          category: 'account',
          requiresData: ['email'],
          department: 'admin',
          sla: '48 hours',
        },
      ],
    };
  }

  // Get relevant snippets based on keywords and intent
  getRelevantSnippets(query: string, intent?: string, limit = 5): KnowledgeSnippet[] {
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/);

    // Score each snippet
    const scored = this.kb.snippets.map(snippet => {
      let score = 0;

      // Match category with intent
      if (intent && snippet.category === intent) {
        score += 10;
      }

      // Match keywords
      for (const keyword of snippet.keywords) {
        if (queryLower.includes(keyword.toLowerCase())) {
          score += 5;
        }
      }

      // Word overlap
      for (const word of words) {
        if (word.length > 3 && snippet.content.toLowerCase().includes(word)) {
          score += 1;
        }
      }

      // Priority boost
      score += snippet.priority;

      return { snippet, score };
    });

    // Return top N snippets
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.snippet);
  }

  // Get escalation rule if applicable
  checkEscalation(query: string, intent?: string): EscalationRule | null {
    const queryLower = query.toLowerCase();

    for (const rule of this.kb.escalationRules) {
      if (queryLower.includes(rule.trigger.toLowerCase())) {
        if (!intent || intent === rule.category) {
          return rule;
        }
      }
    }

    return null;
  }

  // Get all policies as a formatted string
  getPolicies(): string {
    return Object.entries(this.kb.policies)
      .map(([key, value]) => `- ${value}`)
      .join('\n');
  }

  // Format snippets for LLM context
  formatSnippetsForLLM(snippets: KnowledgeSnippet[]): string[] {
    return snippets.map(
      s => `Category: ${s.category}\nContent: ${s.content}`
    );
  }

  // Update knowledge base (for admin endpoint)
  updateSnippet(snippet: KnowledgeSnippet): void {
    const index = this.kb.snippets.findIndex(s => s.id === snippet.id);
    if (index >= 0) {
      this.kb.snippets[index] = snippet;
    } else {
      this.kb.snippets.push(snippet);
    }
    // In production, persist to database or file
  }

  // Get all snippets by category
  getSnippetsByCategory(category: string): KnowledgeSnippet[] {
    return this.kb.snippets.filter(s => s.category === category);
  }

  // Search snippets
  searchSnippets(searchTerm: string): KnowledgeSnippet[] {
    const term = searchTerm.toLowerCase();
    return this.kb.snippets.filter(
      s =>
        s.content.toLowerCase().includes(term) ||
        s.keywords.some(k => k.toLowerCase().includes(term))
    );
  }
}

export const knowledgeManager = new KnowledgeManager();