# WhatsApp Assistant Bot - QA Testing Guide

## Table of Contents
1. [Quick Start](#quick-start)
2. [Local Testing (Simulator)](#local-testing-simulator)
3. [Production Testing (Safe Methods)](#production-testing-safe-methods)
4. [Professional QA Tools](#professional-qa-tools)
5. [Testing Checklist](#testing-checklist)
6. [Bug Tracking](#bug-tracking)

---

## Quick Start

### Run Automated Tests
```bash
# Option 1: Run all bug fix validation tests
npm run test:bugs

# Option 2: Run individual test file
ts-node src/testing/test-bug-fixes.ts
```

---

## Local Testing (Simulator)

### Method 1: Using MessageSimulator (Recommended)

The `MessageSimulator` allows you to send messages to the bot programmatically without needing WhatsApp.

**Create a test script:**
```typescript
import { MessageSimulator } from './src/testing/MessageSimulator.js';

async function testBotLocally() {
  const simulator = new MessageSimulator();
  await simulator.initialize();

  // Send a message
  await simulator.sendUserMessage('תקבע פגישה מחר ב3');

  // Get bot's response
  const response = simulator.getLastBotResponse();
  console.log('Bot response:', response);

  // Check current conversation state
  const state = await simulator.getCurrentState();
  console.log('Current state:', state);

  // Search for events
  const events = await simulator.searchEvents('פגישה');
  console.log('Found events:', events);

  // Cleanup
  await simulator.cleanup();
}

testBotLocally();
```

**Advantages:**
- ✅ No WhatsApp connection needed
- ✅ Fast - instant responses
- ✅ Full control over test flow
- ✅ Can verify internal state
- ✅ Safe - doesn't touch production data

**Example Test Cases:**
```typescript
import { MessageSimulator, TestRunner, TestCase } from './src/testing/MessageSimulator.js';

const tests: TestCase[] = [
  {
    name: 'Create event with time',
    steps: [
      {
        userMessage: 'תקבע פגישה מחר ב15:00',
        expectedResponse: /פגישה.*15:00/,
        validate: async (response, sim) => {
          const events = await sim.getAllEvents();
          return events.some(e => e.title.includes('פגישה'));
        }
      }
    ]
  }
];

const simulator = new MessageSimulator();
await simulator.initialize();

const runner = new TestRunner(simulator);
await runner.runTests(tests);
```

---

## Production Testing (Safe Methods)

### Method 1: Test User Account (Safest)

**Setup:**
1. Create a dedicated test WhatsApp number
2. Register it with the bot
3. All testing happens in isolated environment

```bash
# Add test user to database
psql -d ultrathink -c "INSERT INTO users (phone, name, password_hash) VALUES ('972500000TEST', 'Test User', '\$2b\$10\$...');"
```

### Method 2: WhatsApp Test Mode

WhatsApp-Web.js allows testing without affecting real conversations:

```typescript
// In your local environment, use a separate session
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'test-session' }),
  puppeteer: {
    headless: false // See what's happening
  }
});
```

### Method 3: Direct Message Injection (Advanced)

Create an API endpoint to inject test messages:

```typescript
// src/api/test-endpoint.ts
app.post('/api/test/message', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Only available in development' });
  }

  const { phone, message } = req.body;

  const testMessage: IncomingMessage = {
    messageId: `test_${Date.now()}`,
    from: phone,
    body: message,
    type: 'text',
    timestamp: Date.now(),
    hasMedia: false,
  };

  await messageRouter.handleMessage(testMessage);

  res.json({ success: true });
});
```

**Usage:**
```bash
curl -X POST http://localhost:8080/api/test/message \
  -H "Content-Type: application/json" \
  -d '{"phone": "972500000000", "message": "תקבע פגישה מחר"}'
```

---

## Professional QA Tools

### 1. Botium (WhatsApp Chatbot Testing) - Best for Your Use Case

**What it is:** Enterprise-grade chatbot testing framework with WhatsApp support

**Setup:**
```bash
npm install --save-dev botium-core botium-connector-whatsapp
```

**Example Test:**
```javascript
// botium.json
{
  "botium": {
    "Capabilities": {
      "CONTAINERMODE": "whatsapp",
      "WHATSAPP_PHONE_NUMBER": "+972500000000",
      "WHATSAPP_SESSION_PATH": "./whatsapp-session"
    }
  }
}
```

**Pros:**
- ✅ Specifically designed for messaging apps
- ✅ Supports WhatsApp Business API
- ✅ Can record and replay conversations
- ✅ NLU testing capabilities

**Cons:**
- ❌ Enterprise edition is paid
- ❌ Requires WhatsApp Business API or Web.js integration

**Learn more:** https://www.botium.ai/

---

### 2. Playwright/Puppeteer - UI Automation

Since your bot uses whatsapp-web.js (which uses Puppeteer), you can test the actual WhatsApp Web UI:

```typescript
import { chromium } from 'playwright';

async function testWhatsAppUI() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Navigate to WhatsApp Web
  await page.goto('https://web.whatsapp.com');

  // Scan QR code (manual step)
  await page.waitForSelector('[data-testid="chat-list"]');

  // Search for your bot
  await page.fill('[data-testid="chat-list-search"]', '972555030746');

  // Send a message
  await page.click('span[title="Your Bot"]');
  await page.fill('[data-testid="conversation-compose-box-input"]', 'תקבע פגישה מחר');
  await page.keyboard.press('Enter');

  // Wait for response
  await page.waitForTimeout(2000);

  // Verify response
  const lastMessage = await page.textContent('.message-in:last-child');
  console.log('Bot response:', lastMessage);
}
```

---

### 3. testRigor - AI-Powered Testing

**What it is:** AI-based testing that understands natural language

**Example:**
```
Test Case: Create event with natural language
1. Send message "תקבע פגישה עם מיכאל מחר ב3"
2. Verify response contains "פגישה"
3. Verify response contains "מיכאל"
```

**Pros:**
- ✅ No code required
- ✅ AI understands context
- ✅ Can test complex flows

**Cons:**
- ❌ Paid service
- ❌ Requires integration setup

**Learn more:** https://testrigor.com/

---

### 4. Cyara - WhatsApp Chatbot Testing Platform

**What it is:** Professional platform for conversational AI testing

**Features:**
- Automated regression testing
- Performance testing
- NLU accuracy testing
- Multi-channel support (WhatsApp, Messenger, etc.)

**Pros:**
- ✅ Enterprise-grade
- ✅ Detailed analytics
- ✅ Load testing capabilities

**Cons:**
- ❌ Expensive
- ❌ Overkill for small teams

---

## Testing Checklist

### Pre-Deployment Testing

- [ ] **Unit Tests Pass**
  ```bash
  npm run test:bugs
  ```

- [ ] **Build Succeeds**
  ```bash
  npm run build
  ```

- [ ] **Bug Fixes Validated**
  - [ ] Bug #13: Time recognition works
  - [ ] Bug #14: Search finds partial names
  - [ ] Feature #12: Reminder lead time setting works

- [ ] **Regression Testing**
  - [ ] Create event with date only
  - [ ] Create event with date and time
  - [ ] Create reminder
  - [ ] Search events
  - [ ] List events
  - [ ] Settings menu works

### Post-Deployment Testing

- [ ] **Health Check**
  ```bash
  curl https://ailo.digital/health
  ```

- [ ] **Basic Flow Test (via WhatsApp)**
  1. Send "תפריט"
  2. Verify menu appears with 6 options
  3. Create test event
  4. Search for it
  5. Verify it's found

- [ ] **Monitor Logs**
  ```bash
  ssh root@167.71.145.9 "pm2 logs ultrathink --lines 50"
  ```

- [ ] **Check Redis**
  ```bash
  ssh root@167.71.145.9 "redis-cli LRANGE user_messages 0 10"
  ```

---

## Bug Tracking

### Using Redis Message Log

All messages are logged to Redis with `status: pending` for bugs:

```bash
# Find all pending bugs
ssh root@167.71.145.9 "redis-cli LRANGE user_messages 0 -1" | grep 'pending'

# Check specific user's messages
ssh root@167.71.145.9 "redis-cli LRANGE user_messages 0 -1" | grep '972544345287'
```

### Bug Report Format

When users report bugs with `#`, they're automatically logged:

```json
{
  "timestamp": "2025-10-19T19:53:12.030Z",
  "messageText": "#i asked for specific hour and it didn't recognica",
  "status": "pending",
  "phone": "972544345287"
}
```

**After fixing, mark as fixed:**
```typescript
// Update status in Redis
const messages = await redis.lrange('user_messages', 0, -1);
const bugIndex = messages.findIndex(m => m.includes('#i asked for specific hour'));

await redis.lset('user_messages', bugIndex, JSON.stringify({
  ...JSON.parse(messages[bugIndex]),
  status: 'fixed',
  fixedAt: new Date().toISOString(),
  fix: 'Bug #13 - EntityExtractor time append fix'
}));
```

---

## Advanced Testing Scenarios

### Load Testing

Test how the bot handles multiple simultaneous users:

```typescript
import { MessageSimulator } from './src/testing/MessageSimulator.js';

async function loadTest() {
  const simulators = Array.from({ length: 10 }, (_, i) =>
    new MessageSimulator(`97250000${i.toString().padStart(4, '0')}`, `test-user-${i}`)
  );

  await Promise.all(simulators.map(s => s.initialize()));

  // Send 10 messages concurrently
  await Promise.all(simulators.map(s =>
    s.sendUserMessage('תקבע פגישה מחר ב3')
  ));

  // Verify all got responses
  simulators.forEach((s, i) => {
    const response = s.getLastBotResponse();
    console.log(`User ${i}: ${response ? 'Got response' : 'No response'}`);
  });
}
```

### NLU Accuracy Testing

Test if the bot understands variations:

```typescript
const variations = [
  'תקבע פגישה מחר ב3',
  'קבע לי פגישה מחר בשלוש',
  'צריך פגישה מחר בשעה 15:00',
  'פגישה למחר שלוש אחר הצהריים',
];

for (const message of variations) {
  await simulator.sendUserMessage(message);
  const response = simulator.getLastBotResponse();

  // All should create an event at 15:00
  const hasTime = response.includes('15:00') || response.includes('3');
  console.log(`"${message}" -> ${hasTime ? 'PASS' : 'FAIL'}`);
}
```

---

## Troubleshooting

### Simulator Not Working

**Issue:** MessageSimulator throws error
**Solution:**
```bash
# Ensure database is accessible
psql -d ultrathink -c "SELECT 1"

# Ensure test user can be created
npm run test:setup
```

### Production Tests Affecting Real Users

**Issue:** Test messages appearing in production conversations
**Solution:**
- Always use dedicated test phone number
- Add test user detection in code:
```typescript
if (phone.endsWith('TEST') || phone.startsWith('97250000')) {
  // This is a test message, handle differently
}
```

---

## Next Steps

1. **Setup automated testing in CI/CD:**
   ```yaml
   # .github/workflows/test.yml
   - name: Run tests
     run: npm run test:bugs
   ```

2. **Schedule regular regression tests:**
   ```bash
   # crontab -e
   0 2 * * * cd /root/wAssitenceBot && npm run test:bugs
   ```

3. **Monitor test results:**
   - Set up alerts for test failures
   - Track test coverage over time
   - Review failed tests weekly

---

## Summary

**For Quick Testing:**
- Use `MessageSimulator` locally ✅

**For Professional QA:**
- Consider Botium if budget allows
- Use Playwright for E2E UI tests

**For Production:**
- Test with dedicated test account
- Monitor with health checks
- Use Redis logs for bug tracking

**Remember:**
- Test before every deployment
- Validate all bug fixes
- Keep test cases updated
- Document new test scenarios
