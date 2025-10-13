/**
 * Quick AI Models Test
 * Run: node test-models.js
 */

const https = require('https');
require('dotenv/config');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

const TEST_MESSAGE = 'קבע פגישה עם דני מחר ב-3';

// Test GPT-4.1 nano
async function testGPT() {
  console.log(`\n${colors.cyan}Testing GPT-4.1 nano...${colors.reset}`);

  if (!process.env.OPENAI_API_KEY) {
    console.log(`${colors.red}✗ OPENAI_API_KEY not set${colors.reset}`);
    return { model: 'gpt-4.1-nano', success: false, error: 'API key not set' };
  }

  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: 'gpt-4.1-nano',
      messages: [
        { role: 'system', content: 'You are a Hebrew calendar assistant. Return JSON.' },
        { role: 'user', content: `Extract intent: "${TEST_MESSAGE}"` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 50,
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Length': data.length,
      },
    };

    const startTime = Date.now();
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const responseTime = Date.now() - startTime;

        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            const tokens = parsed.usage || { prompt_tokens: 0, completion_tokens: 0 };
            const cost = (tokens.prompt_tokens / 1000000 * 0.10 + tokens.completion_tokens / 1000000 * 0.40).toFixed(6);

            console.log(`${colors.green}✓ Success!${colors.reset}`);
            console.log(`  Response time: ${responseTime}ms`);
            console.log(`  Tokens: ${tokens.prompt_tokens} in, ${tokens.completion_tokens} out`);
            console.log(`  Cost: $${cost} (₪${(cost * 3.7).toFixed(4)})`);
            console.log(`  Response: ${parsed.choices[0].message.content.substring(0, 100)}...`);

            resolve({
              model: 'gpt-4.1-nano',
              success: true,
              responseTime,
              tokens,
              cost: `$${cost}`
            });
          } catch (e) {
            console.log(`${colors.red}✗ Failed to parse response${colors.reset}`);
            resolve({ model: 'gpt-4.1-nano', success: false, error: 'Parse error' });
          }
        } else {
          const error = JSON.parse(body);
          console.log(`${colors.red}✗ Failed: ${error.error?.message || 'Unknown error'}${colors.reset}`);

          if (error.error?.code === 'model_not_found') {
            console.log(`${colors.yellow}⚠ Model not available. Fallback to gpt-4o-mini recommended.${colors.reset}`);
          }

          resolve({
            model: 'gpt-4.1-nano',
            success: false,
            error: error.error?.message || 'Unknown error',
            statusCode: res.statusCode
          });
        }
      });
    });

    req.on('error', (e) => {
      console.log(`${colors.red}✗ Network error: ${e.message}${colors.reset}`);
      resolve({ model: 'gpt-4.1-nano', success: false, error: e.message });
    });

    req.write(data);
    req.end();
  });
}

// Test Gemini 2.5 Flash-Lite
async function testGemini() {
  console.log(`\n${colors.cyan}Testing Gemini 2.5 Flash-Lite...${colors.reset}`);

  if (!process.env.GEMINI_API_KEY) {
    console.log(`${colors.red}✗ GEMINI_API_KEY not set${colors.reset}`);
    return { model: 'gemini-2.5-flash-lite', success: false, error: 'API key not set' };
  }

  return new Promise((resolve) => {
    const data = JSON.stringify({
      contents: [{
        parts: [{ text: `Extract intent from this Hebrew message as JSON: "${TEST_MESSAGE}"` }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 50,
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const startTime = Date.now();
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const responseTime = Date.now() - startTime;

        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            const text = parsed.candidates[0].content.parts[0].text;
            const estimatedTokens = Math.ceil(text.length / 4);
            const cost = (estimatedTokens / 1000000 * 0.40).toFixed(6);

            console.log(`${colors.green}✓ Success!${colors.reset}`);
            console.log(`  Response time: ${responseTime}ms`);
            console.log(`  Estimated tokens: ~${estimatedTokens} out`);
            console.log(`  Estimated cost: $${cost} (₪${(cost * 3.7).toFixed(4)})`);
            console.log(`  Response: ${text.substring(0, 100)}...`);

            resolve({
              model: 'gemini-2.5-flash-lite',
              success: true,
              responseTime,
              cost: `$${cost} (estimated)`
            });
          } catch (e) {
            console.log(`${colors.red}✗ Failed to parse response${colors.reset}`);
            resolve({ model: 'gemini-2.5-flash-lite', success: false, error: 'Parse error' });
          }
        } else {
          try {
            const error = JSON.parse(body);
            console.log(`${colors.red}✗ Failed: ${error.error?.message || 'Unknown error'}${colors.reset}`);

            if (res.statusCode === 404 || error.error?.message?.includes('not found')) {
              console.log(`${colors.yellow}⚠ Model not available. Try gemini-1.5-flash or gemini-2.0-flash-exp.${colors.reset}`);
            }

            resolve({
              model: 'gemini-2.5-flash-lite',
              success: false,
              error: error.error?.message || 'Unknown error',
              statusCode: res.statusCode
            });
          } catch (e) {
            console.log(`${colors.red}✗ HTTP ${res.statusCode}: ${body.substring(0, 200)}${colors.reset}`);
            resolve({ model: 'gemini-2.5-flash-lite', success: false, error: `HTTP ${res.statusCode}` });
          }
        }
      });
    });

    req.on('error', (e) => {
      console.log(`${colors.red}✗ Network error: ${e.message}${colors.reset}`);
      resolve({ model: 'gemini-2.5-flash-lite', success: false, error: e.message });
    });

    req.write(data);
    req.end();
  });
}

// Main
async function main() {
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}      AI Models API Quick Test${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`Test message: "${TEST_MESSAGE}"\n`);

  const results = [];

  results.push(await testGPT());
  results.push(await testGemini());

  // Summary
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}         SUMMARY REPORT${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════${colors.reset}\n`);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Results: ${colors.green}${successful.length}/${results.length} successful${colors.reset}\n`);

  if (successful.length > 0) {
    console.log(`${colors.bright}✓ Working Models:${colors.reset}`);
    successful.forEach(r => {
      console.log(`  ${colors.green}✓${colors.reset} ${r.model}`);
      console.log(`    Response time: ${r.responseTime}ms`);
      if (r.cost) console.log(`    Cost: ${r.cost}`);
    });
    console.log('');
  }

  if (failed.length > 0) {
    console.log(`${colors.bright}✗ Failed Models:${colors.reset}`);
    failed.forEach(r => {
      console.log(`  ${colors.red}✗${colors.reset} ${r.model}`);
      console.log(`    Error: ${r.error}`);
    });
    console.log('');
  }

  // Recommendations
  console.log(`${colors.bright}Recommendations:${colors.reset}`);

  const bothWork = results.every(r => r.success);
  const gptWorks = results.find(r => r.model === 'gpt-4.1-nano')?.success;
  const geminiWorks = results.find(r => r.model === 'gemini-2.5-flash-lite')?.success;

  if (bothWork) {
    console.log(`  ${colors.green}✓ Both models work! Ready for production.${colors.reset}`);
    console.log(`  ${colors.green}✓ Expected cost: ~$3.60 per 1K messages (₪13.32)${colors.reset}`);
  } else {
    if (!gptWorks) {
      console.log(`  ${colors.yellow}⚠ GPT-4.1 nano not available${colors.reset}`);
      console.log(`    Update src/services/NLPService.ts:350`);
      console.log(`    Change 'gpt-4.1-nano' → 'gpt-4o-mini'`);
    }
    if (!geminiWorks) {
      console.log(`  ${colors.yellow}⚠ Gemini 2.5 Flash-Lite not available${colors.reset}`);
      console.log(`    Update src/services/GeminiNLPService.ts:305`);
      console.log(`    Try 'gemini-1.5-flash' or 'gemini-2.0-flash-exp'`);
    }
  }

  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════${colors.reset}\n`);

  process.exit(bothWork ? 0 : 1);
}

main().catch(e => {
  console.error(`${colors.red}Fatal error: ${e.message}${colors.reset}`);
  process.exit(1);
});
