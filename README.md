# AI Customer Email Reply Automation Guide

Hardened starter for AI-powered Gmail replies: retries + circuit breaker, idempotent sends, health/ready checks, schema-validated inputs, structured logging, Gmail OAuth2, brand voice + templates, and escalation routing.

## Quickstart
1) docker compose up -d
2) cp .env.example .env
   - Fill DATABASE_URL, REDIS_URL
   - Optionally set Gmail OAuth vars if you want to send emails
   - Optionally set department emails (BILLING_EMAIL, LOGISTICS_EMAIL, ADMIN_EMAIL, COMPLAINTS_EMAIL)
3) npm install
4) npm run dev
5) Import postman/collection.json and hit Health, Ready, and Reply

## Gmail OAuth (durable)
- Put OAuth consent screen “In production” to avoid 7‑day refresh-token expiry
- Create OAuth client (Desktop app). Generate a refresh token and set:
  - GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER (optional)

## API
- POST /reply
  - Body: { messageId, threadId, prompt, minConfidence?, tone?, templateId? }
- GET /health, GET /ready

## Escalation
- refund-inquiry + order number → forward to BILLING_EMAIL, confirm 48h SLA
- shipping-delay + order|tracking → forward to LOGISTICS_EMAIL, confirm 48h SLA
- account-access + account email → forward to ADMIN_EMAIL, confirm 48h SLA
- Otherwise: LLM reply with brand voice and strict rules

## Higher security (optional)
- Move secrets and department emails into a secrets manager
- Replace process.env lookups in src/intent.ts and src/adapters/gmail.ts with your secret client