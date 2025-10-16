/**
 * AI Models API Test Script
 *
 * Tests all AI models with dummy data to verify they work correctly
 * Run: npx ts-node scripts/test-ai-models.ts
 */

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface TestResult {
  model: string;
  provider: string;
  success: boolean;
  responseTime: number;
  error?: string;
  response?: string;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: string;
  };
}

const testResults: TestResult[] = [];

// Dummy test data - Hebrew calendar intent
const TEST_MESSAGE = 'קבע פגישה עם דני מחר ב-3';
const TEST_PROMPT = `You are a Hebrew calendar assistant. Extract intent from: "${TEST_MESSAGE}". Return JSON: {"intent": "create_event", "confidence": 0.95}`;

/**
 * Test GPT-4.1 Mini
 */
async function testGPT41Mini(): Promise<TestResult> {
  console.log(`\n${colors.cyan}Testing GPT-4.1 Mini...${colors.reset}`);

  const result: TestResult = {
    model: 'gpt-4.1-mini',
    provider: 'OpenAI',
    success: false,
    responseTime: 0,
  };

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }

    const openai = new OpenAI({ apiKey });
    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Always respond with valid JSON.' },
        { role: 'user', content: TEST_PROMPT }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 100,
    });

    const endTime = Date.now();
    result.responseTime = endTime - startTime;
    result.response = response.choices[0].message.content || 'No response';
    result.success = true;

    // Calculate cost
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const costInput = (inputTokens / 1000000) * 0.40; // $0.40 per 1M input tokens
    const costOutput = (outputTokens / 1000000) * 1.60; // $1.60 per 1M output tokens
    const totalCost = costInput + costOutput;

    result.cost = {
      inputTokens,
      outputTokens,
      estimatedCost: `$${totalCost.toFixed(6)} (₪${(totalCost * 3.7).toFixed(4)})`,
    };

    console.log(`${colors.green}✓ Success!${colors.reset}`);
    console.log(`  Response time: ${result.responseTime}ms`);
    console.log(`  Tokens: ${inputTokens} in, ${outputTokens} out`);
    console.log(`  Cost: ${result.cost.estimatedCost}`);
    console.log(`  Response: ${result.response.substring(0, 100)}...`);

  } catch (error: any) {
    result.error = error.message;
    console.log(`${colors.red}✗ Failed: ${error.message}${colors.reset}`);

    // Check if it's a model not found error
    if (error.message.includes('model') || error.message.includes('not found')) {
      console.log(`${colors.yellow}⚠ Model might not be available yet${colors.reset}`);
      console.log(`${colors.yellow}  Suggestion: Try 'gpt-4o-mini' as fallback${colors.reset}`);
    }
  }

  return result;
}

/**
 * Test Gemini 2.5 Flash-Lite
 */
async function testGemini25FlashLite(): Promise<TestResult> {
  console.log(`\n${colors.cyan}Testing Gemini 2.5 Flash-Lite...${colors.reset}`);

  const result: TestResult = {
    model: 'gemini-2.5-flash-lite',
    provider: 'Google',
    success: false,
    responseTime: 0,
  };

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 100,
      },
    });

    const startTime = Date.now();
    const geminiResult = await model.generateContent(TEST_PROMPT);
    const endTime = Date.now();

    result.responseTime = endTime - startTime;
    result.response = geminiResult.response.text();
    result.success = true;

    // Estimate tokens (Gemini doesn't provide usage in response)
    const estimatedInputTokens = Math.ceil(TEST_PROMPT.length / 4);
    const estimatedOutputTokens = Math.ceil(result.response.length / 4);
    const costInput = (estimatedInputTokens / 1000000) * 0.10;
    const costOutput = (estimatedOutputTokens / 1000000) * 0.40;
    const totalCost = costInput + costOutput;

    result.cost = {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      estimatedCost: `$${totalCost.toFixed(6)} (₪${(totalCost * 3.7).toFixed(4)}) [estimated]`,
    };

    console.log(`${colors.green}✓ Success!${colors.reset}`);
    console.log(`  Response time: ${result.responseTime}ms`);
    console.log(`  Tokens (estimated): ${estimatedInputTokens} in, ${estimatedOutputTokens} out`);
    console.log(`  Cost: ${result.cost.estimatedCost}`);
    console.log(`  Response: ${result.response.substring(0, 100)}...`);

  } catch (error: any) {
    result.error = error.message;
    console.log(`${colors.red}✗ Failed: ${error.message}${colors.reset}`);

    // Check if it's a model not found error
    if (error.message.includes('model') || error.message.includes('not found') || error.message.includes('404')) {
      console.log(`${colors.yellow}⚠ Model might not be available yet${colors.reset}`);
      console.log(`${colors.yellow}  Suggestion: Try 'gemini-2.0-flash-exp' or 'gemini-1.5-flash' as fallback${colors.reset}`);
    }
  }

  return result;
}

/**
 * Test GPT-4o-mini (Fallback)
 */
async function testGPT4oMini(): Promise<TestResult> {
  console.log(`\n${colors.cyan}Testing GPT-4o-mini (fallback)...${colors.reset}`);

  const result: TestResult = {
    model: 'gpt-4o-mini',
    provider: 'OpenAI',
    success: false,
    responseTime: 0,
  };

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }

    const openai = new OpenAI({ apiKey });
    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Always respond with valid JSON.' },
        { role: 'user', content: TEST_PROMPT }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 100,
    });

    const endTime = Date.now();
    result.responseTime = endTime - startTime;
    result.response = response.choices[0].message.content || 'No response';
    result.success = true;

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const costInput = (inputTokens / 1000000) * 0.15; // $0.15 per 1M
    const costOutput = (outputTokens / 1000000) * 0.60; // $0.60 per 1M
    const totalCost = costInput + costOutput;

    result.cost = {
      inputTokens,
      outputTokens,
      estimatedCost: `$${totalCost.toFixed(6)} (₪${(totalCost * 3.7).toFixed(4)})`,
    };

    console.log(`${colors.green}✓ Success!${colors.reset}`);
    console.log(`  Response time: ${result.responseTime}ms`);
    console.log(`  Tokens: ${inputTokens} in, ${outputTokens} out`);
    console.log(`  Cost: ${result.cost.estimatedCost}`);

  } catch (error: any) {
    result.error = error.message;
    console.log(`${colors.red}✗ Failed: ${error.message}${colors.reset}`);
  }

  return result;
}

/**
 * Print summary report
 */
function printSummary(results: TestResult[]) {
  console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}           TEST SUMMARY REPORT          ${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════${colors.reset}\n`);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`${colors.bright}Results:${colors.reset}`);
  console.log(`  ✓ Successful: ${colors.green}${successful.length}/${results.length}${colors.reset}`);
  console.log(`  ✗ Failed: ${colors.red}${failed.length}/${results.length}${colors.reset}\n`);

  if (successful.length > 0) {
    console.log(`${colors.bright}Successful Models:${colors.reset}`);
    successful.forEach(r => {
      console.log(`  ${colors.green}✓${colors.reset} ${r.model} (${r.provider})`);
      console.log(`    - Response time: ${r.responseTime}ms`);
      if (r.cost) {
        console.log(`    - Cost: ${r.cost.estimatedCost}`);
      }
    });
    console.log('');
  }

  if (failed.length > 0) {
    console.log(`${colors.bright}Failed Models:${colors.reset}`);
    failed.forEach(r => {
      console.log(`  ${colors.red}✗${colors.reset} ${r.model} (${r.provider})`);
      console.log(`    - Error: ${r.error}`);
    });
    console.log('');
  }

  // Recommendations
  console.log(`${colors.bright}Recommendations:${colors.reset}`);

  const gpt41Success = results.find(r => r.model === 'gpt-4.1-mini')?.success;
  const gemini25Success = results.find(r => r.model === 'gemini-2.5-flash-lite')?.success;
  const gpt4oSuccess = results.find(r => r.model === 'gpt-4o-mini')?.success;

  if (gpt41Success && gemini25Success) {
    console.log(`  ${colors.green}✓${colors.reset} Both target models work! Ready for production.`);
    console.log(`  ${colors.green}✓${colors.reset} Estimated cost per 1K messages with GPT-4.1-mini`);
  } else if (!gpt41Success && gpt4oSuccess) {
    console.log(`  ${colors.yellow}⚠${colors.reset} GPT-4.1 mini not available. Use GPT-4o-mini as fallback.`);
    console.log(`  ${colors.yellow}⚠${colors.reset} Update: src/services/NLPService.ts line 364`);
    console.log(`  ${colors.yellow}⚠${colors.reset} Change: 'gpt-4.1-mini' → 'gpt-4o-mini'`);
  } else if (!gemini25Success) {
    console.log(`  ${colors.yellow}⚠${colors.reset} Gemini 2.5 Flash-Lite not available. Try alternatives:`);
    console.log(`    - gemini-1.5-flash (stable)`);
    console.log(`    - gemini-2.0-flash-exp (experimental, cheaper)`);
  }

  console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════${colors.reset}\n`);
}

/**
 * Main test execution
 */
async function main() {
  console.log(`${colors.bright}${colors.cyan}AI Models API Test${colors.reset}`);
  console.log(`${colors.cyan}Testing with message: "${TEST_MESSAGE}"${colors.reset}\n`);

  // Check environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.log(`${colors.red}ERROR: OPENAI_API_KEY not set in .env file${colors.reset}`);
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.log(`${colors.yellow}WARNING: GEMINI_API_KEY not set in .env file${colors.reset}`);
  }

  // Run tests
  testResults.push(await testGPT41Mini());
  testResults.push(await testGemini25FlashLite());
  testResults.push(await testGPT4oMini());

  // Print summary
  printSummary(testResults);

  // Exit with appropriate code
  const allSuccess = testResults.slice(0, 2).every(r => r.success); // First 2 are target models
  process.exit(allSuccess ? 0 : 1);
}

// Run tests
main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
