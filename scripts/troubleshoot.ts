// Run with: npx tsx scripts/troubleshoot.ts

import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(color: string, symbol: string, message: string) {
  console.log(`${color}${symbol}${RESET} ${message}`);
}

async function checkEnv() {
  log(BLUE, '🔍', 'Checking environment variables...');
  
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'ANTHROPIC_API_KEY',
  ];
  
  const optional = [
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
    'BILLING_EMAIL',
    'LOGISTICS_EMAIL',
    'ADMIN_EMAIL',
  ];
  
  let allGood = true;
  
  for (const key of required) {
    if (process.env[key]) {
      log(GREEN, '✓', `${key} is set`);
    } else {
      log(RED, '✗', `${key} is MISSING (required)`);
      allGood = false;
    }
  }
  
  for (const key of optional) {
    if (process.env[key]) {
      log(GREEN, '✓', `${key} is set`);
    } else {
      log(YELLOW, '⚠', `${key} is not set (optional, but recommended)`);
    }
  }
  
  return allGood;
}

async function checkDatabase() {
  log(BLUE, '🔍', 'Checking database connection...');
  
  try {
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    log(GREEN, '✓', 'Database connection successful');
    return true;
  } catch (error: any) {
    log(RED, '✗', `Database connection failed: ${error.message}`);
    return false;
  }
}

async function checkRedis() {
  log(BLUE, '🔍', 'Checking Redis connection...');
  
  try {
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    await client.set('health-check', 'ok', { EX: 10 });
    const val = await client.get('health-check');
    await client.quit();
    
    if (val === 'ok') {
      log(GREEN, '✓', 'Redis connection successful');
      return true;
    } else {
      log(RED, '✗', 'Redis read/write failed');
      return false;
    }
  } catch (error: any) {
    log(RED, '✗', `Redis connection failed: ${error.message}`);
    return false;
  }
}

async function checkAnthropicAPI() {
  log(BLUE, '🔍', 'Checking Anthropic API...');
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    log(RED, '✗', 'ANTHROPIC_API_KEY not set');
    return false;
  }
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      }),
    });
    
    if (response.ok) {
      log(GREEN, '✓', 'Anthropic API is accessible');
      return true;
    } else {
      const error = await response.text();
      log(RED, '✗', `Anthropic API error: ${response.status} - ${error}`);
      return false;
    }
  } catch (error: any) {
    log(RED, '✗', `Anthropic API connection failed: ${error.message}`);
    return false;
  }
}

async function checkGmailConfig() {
  log(BLUE, '🔍', 'Checking Gmail OAuth configuration...');
  
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  
  if (!clientId || !clientSecret || !refreshToken) {
    log(YELLOW, '⚠', 'Gmail OAuth not fully configured (optional for testing)');
    return false;
  }
  
  // Basic format validation
  if (!clientId.includes('.apps.googleusercontent.com')) {
    log(YELLOW, '⚠', 'GMAIL_CLIENT_ID format looks incorrect');
  }
  
  if (!refreshToken.startsWith('1//')) {
    log(YELLOW, '⚠', 'GMAIL_REFRESH_TOKEN format looks incorrect');
  }
  
  log(GREEN, '✓', 'Gmail OAuth configuration present');
  return true;
}

async function checkKnowledgeBase() {
  log(BLUE, '🔍', 'Checking knowledge base...');
  
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const kbPath = path.join(process.cwd(), 'knowledge-base.json');
    
    if (!fs.existsSync(kbPath)) {
      log(YELLOW, '⚠', 'knowledge-base.json not found (using default)');
      return false;
    }
    
    const content = fs.readFileSync(kbPath, 'utf-8');
    const kb = JSON.parse(content);
    
    if (!kb.snippets || !Array.isArray(kb.snippets)) {
      log(RED, '✗', 'knowledge-base.json: missing or invalid "snippets" array');
      return false;
    }
    
    if (kb.snippets.length === 0) {
      log(YELLOW, '⚠', 'knowledge-base.json: no snippets defined');
      return false;
    }
    
    log(GREEN, '✓', `Knowledge base loaded (${kb.snippets.length} snippets)`);
    return true;
  } catch (error: any) {
    log(RED, '✗', `Knowledge base error: ${error.message}`);
    return false;
  }
}

async function testEndToEnd() {
  log(BLUE, '🔍', 'Testing end-to-end flow...');
  
  try {
    // Check if server is running
    const response = await fetch('http://localhost:3000/health');
    
    if (!response.ok) {
      log(RED, '✗', 'Server is not responding (is it running?)');
      log(YELLOW, '💡', 'Start the server with: npm run dev');
      return false;
    }
    
    const health = await response.json();
    
    if (health.ok) {
      log(GREEN, '✓', 'Server health check passed');
    } else {
      log(YELLOW, '⚠', 'Server health check returned degraded status');
      console.log('   Dependencies:', health.deps);
    }
    
    return health.ok;
  } catch (error: any) {
    log(YELLOW, '⚠', `Server not reachable: ${error.message}`);
    log(YELLOW, '💡', 'Start the server with: npm run dev');
    return false;
  }
}

async function checkCostMetrics() {
  log(BLUE, '🔍', 'Checking cost metrics...');
  
  try {
    const response = await fetch('http://localhost:3000/admin/metrics');
    
    if (!response.ok) {
      log(YELLOW, '⚠', 'Metrics endpoint not accessible');
      return false;
    }
    
    const metrics = await response.json();
    
    console.log('\n   Cost Metrics:');
    console.log(`   └─ Total tokens: ${metrics.totalTokens}`);
    console.log(`   └─ Estimated cost: $${metrics.estimatedCost}`);
    console.log(`   └─ Cache hit rate: ${metrics.cacheHitRate}`);
    
    if (metrics.last24Hours) {
      console.log(`   └─ Last 24h: ${metrics.last24Hours.total} emails`);
      console.log(`   └─ Escalation rate: ${metrics.last24Hours.escalationRate}`);
    }
    
    // Warnings
    const cost = parseFloat(metrics.estimatedCost);
    if (cost > 10) {
      log(YELLOW, '⚠', `High cost detected: $${cost.toFixed(2)}`);
    }
    
    const cacheRate = parseFloat(metrics.cacheHitRate);
    if (cacheRate < 70) {
      log(YELLOW, '⚠', `Low cache hit rate: ${cacheRate.toFixed(1)}%`);
    }
    
    return true;
  } catch (error: any) {
    log(YELLOW, '⚠', `Could not fetch metrics: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n' + BLUE + '═'.repeat(50) + RESET);
  console.log(BLUE + '  AI Customer Email Automation - Health Check' + RESET);
  console.log(BLUE + '═'.repeat(50) + RESET + '\n');
  
  const results = {
    env: await checkEnv(),
    database: await checkDatabase(),
    redis: await checkRedis(),
    anthropic: await checkAnthropicAPI(),
    gmail: await checkGmailConfig(),
    knowledgeBase: await checkKnowledgeBase(),
    server: await testEndToEnd(),
    metrics: await checkCostMetrics(),
  };
  
  console.log('\n' + BLUE + '═'.repeat(50) + RESET);
  console.log(BLUE + '  Summary' + RESET);
  console.log(BLUE + '═'.repeat(50) + RESET + '\n');
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  if (passed === total) {
    log(GREEN, '✓', `All checks passed! (${passed}/${total})`);
    console.log('\n' + GREEN + '🎉 System is ready for production!' + RESET + '\n');
  } else {
    log(YELLOW, '⚠', `${passed}/${total} checks passed`);
    console.log('\n' + YELLOW + '💡 Review the warnings above before going live.' + RESET + '\n');
  }
  
  console.log('Next steps:');
  console.log('  1. Fix any red ✗ items above');
  console.log('  2. Address yellow ⚠ warnings if needed');
  console.log('  3. Start the server: npm run dev');
  console.log('  4. Test with: curl -X POST http://localhost:3000/reply ...');
  console.log('  5. Monitor at: http://localhost:3000/admin/metrics');
  console.log('');
}

main().catch(console.error);