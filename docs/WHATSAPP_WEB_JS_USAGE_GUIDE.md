# WhatsApp-Web.js Usage Guide

## Installation

```bash
npm install whatsapp-web.js
```

## Basic Setup

### 1. Initialize Client

```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './sessions'  // Where to store session data
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});
```

### 2. Handle QR Code Authentication

```javascript
const qrcode = require('qrcode-terminal');

client.on('qr', (qr) => {
    // Display QR code in terminal
    qrcode.generate(qr, { small: true });
    console.log('Scan this QR code with WhatsApp');
});

client.on('authenticated', () => {
    console.log('Authenticated successfully!');
});

client.on('ready', () => {
    console.log('Client is ready!');
});
```

### 3. Start Client

```javascript
client.initialize();
```

## Receiving Messages

### Basic Message Handler

```javascript
client.on('message', async (msg) => {
    console.log('Message received:', msg.body);
    console.log('From:', msg.from);
    console.log('Message ID:', msg.id._serialized);

    // Check if message is from yourself
    if (msg.fromMe) {
        console.log('This is my own message');
        return;
    }

    // Reply to message
    await msg.reply('I received your message!');
});
```

### Message Object Properties

```javascript
client.on('message', async (msg) => {
    // Message content
    console.log('Body:', msg.body);                    // Text content
    console.log('Type:', msg.type);                    // 'chat', 'image', 'video', etc.

    // Sender information
    console.log('From:', msg.from);                    // Phone number with @c.us
    console.log('Sender:', msg.author);                // In groups: actual sender
    console.log('From Me:', msg.fromMe);               // Boolean

    // Message metadata
    console.log('Timestamp:', msg.timestamp);          // Unix timestamp
    console.log('ID:', msg.id._serialized);           // Unique message ID

    // Message features
    console.log('Has Media:', msg.hasMedia);          // Boolean
    console.log('Has Quoted Message:', msg.hasQuotedMsg); // Boolean
    console.log('Is Group:', msg.isGroup);            // Boolean
    console.log('Is Status:', msg.isStatus);          // Boolean
});
```

## Sending Messages

### Send to Phone Number

```javascript
// Format: countrycode + number + @c.us
const number = '972501234567@c.us';
await client.sendMessage(number, 'Hello from bot!');
```

### Send with Formatting

```javascript
// Bold, italic, strikethrough, monospace
await client.sendMessage(number, '*Bold* _italic_ ~strikethrough~ ```monospace```');

// Line breaks
await client.sendMessage(number, 'Line 1\nLine 2\nLine 3');

// Emojis
await client.sendMessage(number, 'Hello! 👋 🎉');
```

### Reply to Message

```javascript
client.on('message', async (msg) => {
    await msg.reply('This is a reply!');
});
```

### Send Media

```javascript
const { MessageMedia } = require('whatsapp-web.js');

// From file
const media = MessageMedia.fromFilePath('./image.jpg');
await client.sendMessage(number, media, { caption: 'Check this out!' });

// From URL
const media = await MessageMedia.fromUrl('https://example.com/image.jpg');
await client.sendMessage(number, media);

// From base64
const media = new MessageMedia('image/jpeg', base64Data, 'filename.jpg');
await client.sendMessage(number, media);
```

## Reactions

```javascript
client.on('message', async (msg) => {
    // React with emoji
    await msg.react('👍');
    await msg.react('❤️');
    await msg.react('✅');

    // Remove reaction
    await msg.react('');
});
```

## Quoted Messages (Replies)

### Check if Message is a Reply

```javascript
client.on('message', async (msg) => {
    if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        console.log('Replied to:', quotedMsg.body);
    }
});
```

### Send Reply

```javascript
client.on('message', async (msg) => {
    // Reply to this message
    await msg.reply('Got it!');
});
```

## Connection State Management

### Handle All Connection States

```javascript
client.on('qr', (qr) => {
    console.log('QR Code received, scan with phone');
});

client.on('authenticated', () => {
    console.log('Authentication successful');
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
});

client.on('ready', () => {
    console.log('WhatsApp client ready');
});

client.on('disconnected', (reason) => {
    console.log('Client disconnected:', reason);

    // Check if logged out
    if (reason === 'LOGOUT') {
        console.log('User logged out, need to re-authenticate');
        // Clear session and exit
        process.exit(1);
    } else {
        // Temporary disconnect, reconnect
        console.log('Reconnecting...');
        client.initialize();
    }
});
```

## Session Management

### LocalAuth Strategy (Recommended)

```javascript
const { LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './sessions',          // Session storage path
        clientId: 'my-bot'               // Optional: for multiple sessions
    })
});
```

**Session files location:**
- Stored in `./sessions/Default/` (or `./sessions/{clientId}/`)
- Files persist between restarts
- No need to scan QR code again after first authentication

### NoAuth Strategy (Not Recommended)

```javascript
const { NoAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new NoAuth()  // No session persistence
});
// You'll need to scan QR every time
```

### Clear Session

```javascript
const fs = require('fs');
const path = require('path');

function clearSession() {
    const sessionPath = './sessions';
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('Session cleared');
    }
}
```

## Working with Chats

### Get All Chats

```javascript
const chats = await client.getChats();
console.log(`You have ${chats.length} chats`);

chats.forEach(chat => {
    console.log('Name:', chat.name);
    console.log('ID:', chat.id._serialized);
    console.log('Is Group:', chat.isGroup);
    console.log('Unread Count:', chat.unreadCount);
});
```

### Get Specific Chat

```javascript
const chatId = '972501234567@c.us';
const chat = await client.getChatById(chatId);

console.log('Chat name:', chat.name);
console.log('Last message:', chat.lastMessage?.body);
```

### Get Chat Messages

```javascript
const chat = await client.getChatById(chatId);
const messages = await chat.fetchMessages({ limit: 50 });

messages.forEach(msg => {
    console.log(`[${msg.timestamp}] ${msg.from}: ${msg.body}`);
});
```

### Mark Chat as Read

```javascript
const chat = await client.getChatById(chatId);
await chat.sendSeen();
```

## Working with Contacts

### Get Contact Info

```javascript
client.on('message', async (msg) => {
    const contact = await msg.getContact();

    console.log('Name:', contact.name);
    console.log('Push Name:', contact.pushname);      // Name in WhatsApp
    console.log('Number:', contact.number);
    console.log('Is Business:', contact.isBusiness);
    console.log('Is My Contact:', contact.isMyContact);
});
```

### Get All Contacts

```javascript
const contacts = await client.getContacts();
console.log(`You have ${contacts.length} contacts`);

contacts.forEach(contact => {
    if (contact.isMyContact) {
        console.log('Contact:', contact.name || contact.pushname);
    }
});
```

## Groups

### Detect Group Messages

```javascript
client.on('message', async (msg) => {
    if (msg.isGroup) {
        const chat = await msg.getChat();
        console.log('Group name:', chat.name);
        console.log('Sender:', msg.author);  // Who sent in the group
    }
});
```

### Get Group Info

```javascript
const chat = await client.getChatById('groupId@g.us');

console.log('Group name:', chat.name);
console.log('Participants:', chat.participants.length);
console.log('Description:', chat.description);

// Get participants
chat.participants.forEach(participant => {
    console.log('Member:', participant.id._serialized);
    console.log('Is Admin:', participant.isAdmin);
});
```

## Message Types

### Check Message Type

```javascript
client.on('message', async (msg) => {
    switch (msg.type) {
        case 'chat':
            console.log('Text message:', msg.body);
            break;

        case 'image':
            console.log('Image received');
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                // Save media.data (base64)
            }
            break;

        case 'video':
            console.log('Video received');
            break;

        case 'audio':
        case 'ptt':  // Push to talk (voice message)
            console.log('Audio/Voice message');
            break;

        case 'document':
            console.log('Document received');
            break;

        case 'sticker':
            console.log('Sticker received');
            break;

        default:
            console.log('Unknown type:', msg.type);
    }
});
```

### Download Media

```javascript
client.on('message', async (msg) => {
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();

        console.log('Mime type:', media.mimetype);
        console.log('Filename:', media.filename);
        console.log('Data:', media.data);  // Base64 string

        // Save to file
        const fs = require('fs');
        const buffer = Buffer.from(media.data, 'base64');
        fs.writeFileSync(`./${media.filename}`, buffer);
    }
});
```

## Advanced Features

### Typing Indicator

```javascript
const chat = await client.getChatById(chatId);
await chat.sendStateTyping();  // Show typing...
await new Promise(resolve => setTimeout(resolve, 2000));  // Wait 2s
await chat.clearState();  // Clear typing
await client.sendMessage(chatId, 'Here is your answer!');
```

### Recording Indicator

```javascript
const chat = await client.getChatById(chatId);
await chat.sendStateRecording();  // Show recording...
await new Promise(resolve => setTimeout(resolve, 3000));
await chat.clearState();
```

### Get Phone Number from Chat ID

```javascript
const chatId = '972501234567@c.us';
const phoneNumber = chatId.split('@')[0];
console.log('Phone:', phoneNumber);  // 972501234567
```

### Format Phone Number

```javascript
function formatPhoneNumber(phone) {
    // Remove all non-digits
    phone = phone.replace(/\D/g, '');

    // Add @c.us if not present
    if (!phone.includes('@')) {
        phone = `${phone}@c.us`;
    }

    return phone;
}

// Usage
const chatId = formatPhoneNumber('972-50-123-4567');
// Result: 972501234567@c.us
```

### Check if Number is Registered on WhatsApp

```javascript
const numberId = await client.getNumberId('972501234567');

if (numberId) {
    console.log('Number exists on WhatsApp');
    console.log('Chat ID:', numberId._serialized);
    await client.sendMessage(numberId._serialized, 'Hello!');
} else {
    console.log('Number not on WhatsApp');
}
```

## Error Handling

### Wrap All Operations in Try-Catch

```javascript
client.on('message', async (msg) => {
    try {
        await msg.reply('Response');
    } catch (error) {
        console.error('Failed to send message:', error);

        if (error.message.includes('not connected')) {
            console.log('Client not connected, waiting...');
        }
    }
});
```

### Handle Send Failures

```javascript
async function sendMessageSafely(chatId, text, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await client.sendMessage(chatId, text);
            return true;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    return false;
}
```

## Complete Example

```javascript
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Initialize client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './sessions'
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// QR Code
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Scan the QR code above');
});

// Ready
client.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
});

// Message handler
client.on('message', async (msg) => {
    console.log(`📨 Message from ${msg.from}: ${msg.body}`);

    // Ignore own messages
    if (msg.fromMe) return;

    // React to message
    await msg.react('👀');

    // Command: !ping
    if (msg.body === '!ping') {
        await msg.reply('Pong! 🏓');
    }

    // Command: !info
    if (msg.body === '!info') {
        const contact = await msg.getContact();
        const chat = await msg.getChat();

        await msg.reply(
            `Name: ${contact.pushname}\n` +
            `Number: ${contact.number}\n` +
            `Is Group: ${chat.isGroup}`
        );
    }

    // Command: !image
    if (msg.body === '!image') {
        const media = MessageMedia.fromFilePath('./example.jpg');
        await client.sendMessage(msg.from, media, {
            caption: 'Here is your image!'
        });
    }

    // Echo command
    if (msg.body.startsWith('!echo ')) {
        const text = msg.body.slice(6);
        await msg.reply(text);
    }
});

// Disconnected
client.on('disconnected', (reason) => {
    console.log('❌ Disconnected:', reason);

    if (reason === 'LOGOUT') {
        console.log('User logged out - exiting');
        process.exit(1);
    } else {
        console.log('Reconnecting...');
        setTimeout(() => client.initialize(), 5000);
    }
});

// Initialize
client.initialize();
```

## Performance Tips

### 1. Message Caching
Cache message objects if you need to react/reply later:
```javascript
const messageCache = new Map();

client.on('message', (msg) => {
    messageCache.set(msg.id._serialized, msg);

    // Keep only last 100 messages
    if (messageCache.size > 100) {
        const firstKey = messageCache.keys().next().value;
        messageCache.delete(firstKey);
    }
});

// Later: react to cached message
const msg = messageCache.get(messageId);
if (msg) await msg.react('✅');
```

### 2. Avoid Downloading Large Media
```javascript
client.on('message', async (msg) => {
    if (msg.hasMedia) {
        // Check size first
        const media = await msg.downloadMedia();
        const sizeInMB = Buffer.from(media.data, 'base64').length / (1024 * 1024);

        if (sizeInMB > 10) {
            await msg.reply('File too large (>10MB)');
            return;
        }
    }
});
```

### 3. Rate Limiting
```javascript
const userLastMessage = new Map();
const RATE_LIMIT_MS = 5000;  // 5 seconds

client.on('message', async (msg) => {
    const lastTime = userLastMessage.get(msg.from) || 0;
    const now = Date.now();

    if (now - lastTime < RATE_LIMIT_MS) {
        console.log('Rate limited:', msg.from);
        return;
    }

    userLastMessage.set(msg.from, now);

    // Process message...
});
```

## Common Issues

### Issue: "Evaluation failed: ReferenceError: something is not defined"
**Solution:** Update to latest whatsapp-web.js version:
```bash
npm update whatsapp-web.js
```

### Issue: QR code not scanning / authentication fails
**Solution:** Clear session and try again:
```bash
rm -rf ./sessions
```

### Issue: High memory usage
**Solutions:**
- Use headless mode (default)
- Disable unnecessary Puppeteer features
- Don't download all media
- Limit message cache size

### Issue: "Browser was not found"
**Solution:** Install Chromium dependencies (Linux):
```bash
sudo apt-get install -y chromium-browser
```

## Resources

- **GitHub:** https://github.com/pedroslopez/whatsapp-web.js
- **Documentation:** https://docs.wwebjs.dev/
- **Discord Community:** https://discord.gg/H7DqQs4

---

**Last Updated:** 2025-10-13
