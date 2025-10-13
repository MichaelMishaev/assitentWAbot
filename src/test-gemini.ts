import dotenv from 'dotenv';
import { GeminiNLPService } from './services/GeminiNLPService.js';

dotenv.config();

async function testGemini() {
  console.log('🧪 Testing Gemini NLP Service...\n');

  const gemini = new GeminiNLPService();

  // Test connection
  console.log('1. Testing Gemini API connection...');
  try {
    const connected = await gemini.testConnection();
    console.log(connected ? '✅ Connected to Gemini API\n' : '❌ Failed to connect\n');
  } catch (error: any) {
    console.error('❌ Connection failed:', error.message);
    if (error.message.includes('404') || error.message.includes('not found')) {
      console.log('\n⚠️  Model "gemini-2.5-flash-lite" not available yet.');
      console.log('Suggestion: Update to "gemini-1.5-flash" or "gemini-2.0-flash-exp"\n');
    }
    return;
  }

  // Mock contacts
  const contacts = [
    { id: '1', userId: 'test', name: 'דני', relation: 'חבר', aliases: ['דניאל', 'דן'], createdAt: new Date(), updatedAt: new Date() },
  ];

  // Test case
  const testMessage = 'קבע פגישה עם דני מחר ב-3';

  console.log(`\n2. Testing: "${testMessage}"`);
  try {
    const result = await gemini.parseIntent(testMessage, contacts, 'Asia/Jerusalem');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('\n✅ Gemini test complete!');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.message.includes('404') || error.message.includes('not found')) {
      console.log('\n⚠️  Model "gemini-2.5-flash-lite" not available.');
      console.log('Update src/services/GeminiNLPService.ts:305');
      console.log('Try: "gemini-1.5-flash" (stable) or "gemini-2.0-flash-exp" (experimental)');
    }
  }
}

testGemini().catch(console.error);
