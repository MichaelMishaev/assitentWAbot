import dotenv from 'dotenv';
import { NLPService } from './services/NLPService';

dotenv.config();

async function testNLP() {
  console.log('🧪 Testing NLP Service...\n');

  const nlp = new NLPService();

  // Test connection
  console.log('1. Testing OpenAI connection...');
  const connected = await nlp.testConnection();
  console.log(connected ? '✅ Connected to OpenAI API\n' : '❌ Failed to connect\n');

  // Mock contacts
  const contacts = [
    { id: '1', userId: 'test', name: 'דני', relation: 'חבר', aliases: ['דניאל', 'דן'], createdAt: new Date(), updatedAt: new Date() },
    { id: '2', userId: 'test', name: 'אמא', relation: 'משפחה', aliases: [], createdAt: new Date(), updatedAt: new Date() },
    { id: '3', userId: 'test', name: 'שרה', relation: 'עבודה', aliases: ['שרי'], createdAt: new Date(), updatedAt: new Date() }
  ];

  // Test cases
  const testMessages = [
    'קבע פגישה עם דני מחר ב-3',
    'תזכיר לי להתקשר לאמא ביום רביעי',
    'מה יש לי מחר?',
    'שלח לדני שאני אאחר',
    'קבע ברית ב-12/11/2025 בתל אביב'
  ];

  for (const message of testMessages) {
    console.log(`\n2. Testing: "${message}"`);
    const result = await nlp.parseIntent(message, contacts, 'Asia/Jerusalem');
    console.log('Result:', JSON.stringify(result, null, 2));
  }

  console.log('\n✅ NLP tests complete!');
}

testNLP().catch(console.error);
