# AI Customer Email Automation - Gmail Production Template

A **battle-tested**, **cost-optimized** AI customer service system that prevents hallucinations, manages costs, and scales reliably.

## 🎯 Pain Points Solved

### 1. **Cost Control** (90% savings)
- **Prompt caching**: System prompts cached for 5 minutes → 90% cost reduction
- **Template-first routing**: Simple queries answered without LLM calls
- **Smart escalation**: Auto-escalate when no knowledge → prevents wasted API calls
- **Token tracking**: Real-time cost monitoring at `/admin/metrics`

**Cost Example:**
- Without caching: 1000 emails/day × 2000 tokens × $0.003/1K = **$6/day**
- With caching: 1000 emails/day × 200 tokens × $0.003/1K = **$0.60/day**

### 2. **Hallucination Prevention**
- ✅ **Grounded responses**: LLM only uses provided knowledge base
- ✅ **Required citations**: Every claim must reference a knowledge snippet
- ✅ **Output validation**: Flags responses with red-flag phrases
- ✅ **Confidence scoring**: Auto-escalates low-confidence replies
- ✅ **No specific data**: Prevents inventing order numbers, tracking IDs, etc.

### 3. **Production Hardening**
- ✅ **Rate limiting**: 10 requests/hour per thread
- ✅ **Circuit breaker**: Auto-stops after 5 consecutive failures
- ✅ **Retry logic**: 3 attempts with exponential backoff
- ✅ **Dead letter queue**: Failed messages queued for manual review
- ✅ **Idempotency**: Prevents duplicate sends

### 4. **Observability**
- `/admin/metrics` - Cost, cache hit rate, escalation rate
- `/admin/dlq` - View failed messages
- Structured JSON logging for log aggregation
- Database audit trail for all replies

---

## 🚀 Quick Start

### 1. Setup Environment
```bash
# Clone and install
git clone <repo>
cd ai-customer-email-automation
npm install

# Start dependencies
docker compose up -d

# Configure
cp .env.example .env
```

### 2. Configure `.env`
```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app
REDIS_URL=redis://localhost:6379

# Anthropic API (required)
ANTHROPIC_API_KEY=sk-ant-...

# Gmail OAuth2 (for sending)
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_USER=support@yourcompany.com

# Department emails
BILLING_EMAIL=billing@yourcompany.com
LOGISTICS_EMAIL=logistics@yourcompany.com
ADMIN_EMAIL=admin@yourcompany.com
COMPLAINTS_EMAIL=complaints@yourcompany.com
```

### 3. Initialize Database
```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Customize Knowledge Base
Edit `knowledge-base.json` with your:
- Company policies
- FAQ answers
- Escalation rules
- Department routing

### 5. Run
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

---

## 📚 Knowledge Base Management

The system uses a **JSON knowledge base** that you can edit without code changes.

### Structure
```json
{
  "snippets": [
    {
      "id": "unique-id",
      "category": "refund|shipping|account|billing|general",
      "keywords": ["refund", "money back"],
      "content": "The actual answer...",
      "priority": 10
    }
  ],
  "policies": {
    "rule-name": "Never promise X..."
  },
  "escalationRules": [
    {
      "trigger": "keyword",
      "requiresData": ["orderNumber"],
      "department": "billing",
      "sla": "48 hours"
    }
  ]
}
```

### Best Practices

1. **Write Clear Snippets**
   - ✅ "Refunds take 5-7 business days"
   - ❌ "Refunds are fast"

2. **Use Keywords Wisely**
   - Add synonyms: ["refund", "money back", "return"]
   - Include common misspellings

3. **Set Priorities**
   - 10 = Critical (exact policy)
   - 5-9 = Important
   - 1-4 = Supplementary

4. **Test Coverage**
   ```bash
   curl -X POST http://localhost:3000/reply \
     -H "Content-Type: application/json" \
     -d '{
       "messageId": "test123",
       "threadId": "thread123",
       "prompt": "I want a refund for order #12345"
     }'
   ```

---

## 🛡️ Hallucination Safeguards

### 1. Red Flag Detection
Automatically flags responses containing:
- "guarantee", "promise", "definitely will"
- Specific order numbers not in knowledge base
- Dollar amounts not in knowledge base
- Unauthorized commitments

### 2. Citation Requirements
```
✅ Good: "Refunds take 5-7 business days [KB:0]"
❌ Bad: "Refunds take 5-7 business days" (no citation)
```

### 3. Confidence Thresholds
- < 0.8: Auto-escalate to human
- 0.8-0.9: Send but log for review
- > 0.9: High confidence

### 4. No-Knowledge Escalation
If no relevant snippets found → immediate escalation (prevents making things up)

---

## 💰 Cost Optimization Strategies

### Built-In Optimizations

1. **Template-First Routing** (0 API calls)
   - Simple queries → use knowledge base directly
   - Example: "Where's my refund?" → template response

2. **Prompt Caching** (90% savings)
   - System prompt cached for 5 minutes
   - First call: $0.003/1K tokens
   - Cached: $0.0003/1K tokens

3. **Smart Escalation** (prevents wasted calls)
   - No knowledge? → escalate immediately
   - Complex query? → route to human first

4. **Low Temperature** (fewer tokens)
   - Temperature: 0.2 (vs 0.7 default)
   - More concise, factual responses

### Monitoring Costs

```bash
# View real-time metrics
curl http://localhost:3000/admin/metrics

# Response:
{
  "totalTokens": 15234,
  "estimatedCost": "0.0456",
  "cacheHitRate": "87.3%",
  "last24Hours": {
    "total": 234,
    "escalationRate": "12.4%",
    "avgConfidence": "0.89"
  }
}
```

### Cost Alerts
Set up alerts when:
- Daily cost > $X
- Cache hit rate < 70%
- Escalation rate > 20%

---

## 🔄 Request Flow

```
Incoming Email
    ↓
Rate Limit Check
    ↓
Intent Detection (keyword-based, FREE)
    ↓
Escalation Rules? → [YES] → Forward to dept + template response
    ↓ [NO]
Knowledge Base Search
    ↓
Simple query + good match? → [YES] → Template response (FREE)
    ↓ [NO]
Call LLM with grounded context
    ↓
Validate output (citations, red flags)
    ↓
Confidence check
    ↓
< threshold? → [YES] → Escalate
    ↓ [NO]
Idempotency check
    ↓
Send reply + log to DB
```

---

## 📊 Monitoring & Alerts

### Key Metrics to Track

1. **Cost Metrics**
   - Daily API spend
   - Tokens per request
   - Cache hit rate

2. **Quality Metrics**
   - Escalation rate
   - Average confidence
   - Flagged responses

3. **Reliability Metrics**
   - DLQ size
   - Circuit breaker opens
   - Failed sends

### Recommended Dashboards

```javascript
// Grafana / Datadog query examples:
- avg(reply.confidence) by day
- count(reply.outcome='escalated') / count(*)
- sum(llm.tokens_used) by hour
- gauge(dlq.size)
```

---

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Test
```bash
# Test with real Gmail (requires OAuth setup)
npm run itest
```

### Manual Testing
```bash
# Health check
curl http://localhost:3000/health

# Test reply
curl -X POST http://localhost:3000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg_123",
    "threadId": "thread_123",
    "prompt": "I need help with my order #12345",
    "minConfidence": 0.8
  }'
```

---

## 🔐 Security Considerations

1. **API Keys**: Use environment variables or secrets manager
2. **Rate Limiting**: Default 10 req/hour per thread (adjust in code)
3. **Input Validation**: Max 4000 chars, schema-validated
4. **No PII in Logs**: messageId/threadId only, never email content
5. **Gmail OAuth**: Use "Internal" or "In Production" to avoid token expiry

---

## 📈 Scaling to Production

### Horizontal Scaling
- **Stateless design**: Scale app servers freely
- **Redis**: Use managed Redis (AWS ElastiCache, Redis Cloud)
- **Database**: Connection pooling via Prisma

### Performance Tuning
- **Prisma Connection Pool**: `connection_limit=10` in DATABASE_URL
- **Redis Pipeline**: Batch idempotency checks
- **LLM Timeout**: 30s default (adjust in retry.ts)

### High Availability
- **Multi-region**: Deploy app in 2+ regions
- **Circuit Breaker**: Auto-recovers after 30s cooldown
- **Dead Letter Queue**: Persistent storage for failed messages

---

## 🆘 Troubleshooting

### "CIRCUIT_OPEN" errors
- **Cause**: 5+ consecutive LLM failures
- **Fix**: Check Anthropic API status, wait 30s for auto-recovery
- **Prevention**: Set up fallback to manual queue

### High costs
- **Check**: Cache hit rate at `/admin/metrics`
- **Fix**: Ensure system prompt doesn't change frequently
- **Tip**: Use template responses for common queries

### High escalation rate (>30%)
- **Cause**: Knowledge base gaps
- **Fix**: Review DLQ, add missing snippets to knowledge-base.json
- **Tool**: Check `/admin/dlq` for patterns

### Duplicate sends
- **Check**: Redis connection (idempotency store)
- **Fix**: Ensure REDIS_URL is correct
- **Fallback**: Uses in-memory store if Redis unavailable

---

## 🎓 Best Practices

### Knowledge Base
- ✅ Update monthly based on support tickets
- ✅ A/B test snippet variations
- ✅ Include seasonal content (holidays, sales)

### Monitoring
- ✅ Daily cost review
- ✅ Weekly quality audit (sample 20 replies)
- ✅ Alert on escalation rate > 20%

### Continuous Improvement
- ✅ Analyze DLQ weekly
- ✅ Review low-confidence replies
- ✅ Add patterns to escalation rules

---

## 📝 License

MIT License - Use freely for commercial projects

---

## 🤝 Support

- **Issues**: GitHub Issues
- **Docs**: See `/docs` folder
- **Community**: Discord / Slack (link here)

---

**Built with ❤️ for production customer service teams**