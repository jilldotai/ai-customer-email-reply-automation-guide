import { brandStyle, fewShots } from './voice.js';

export function buildSystemPrompt() {
  const banned = brandStyle.bannedPhrases.map(p => `- ${p}`).join('\n');
  const shots = fewShots.map(s => `Context: ${s.context}\nReply: ${s.reply}`).join('\n\n');
  return `You draft customer email replies grounded ONLY in approved snippets and policies.

Brand style:
- Tone: ${brandStyle.tone}
- Formality: ${brandStyle.formality}
- Empathy: ${brandStyle.empathyLevel}

Never include:
${banned}

Rules:
- Cite snippet IDs you used at the end as [snip:ID1,ID2]
- Never promise refunds, credits, SLAs, or legal commitments
- <= 150 words unless necessary
- If information is missing, ask ONE clarifying question
- Refuse to include information outside the provided snippets and context

Few-shot examples:
${shots}
`;
}