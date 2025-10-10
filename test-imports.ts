/**
 * Test imports one by one to identify the failing module
 */

console.log('1. Testing logger import...');
import logger from './src/utils/logger.js';
console.log('✅ logger imported');

console.log('2. Testing redis import...');
import { redis } from './src/config/redis.js';
console.log('✅ redis imported');

console.log('3. Testing IMessageProvider import...');
import { IMessageProvider } from './src/providers/IMessageProvider.js';
console.log('✅ IMessageProvider imported');

console.log('4. Testing createMessageRouter import...');
import { createMessageRouter } from './src/services/MessageRouter.js';
console.log('✅ createMessageRouter imported');

console.log('✅ All imports successful!');
process.exit(0);
