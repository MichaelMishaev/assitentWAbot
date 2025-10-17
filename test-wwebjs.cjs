/**
 * Test whatsapp-web.js to see if it bypasses the 405 error
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('🚀 Testing whatsapp-web.js...');
console.log('This uses a real Chrome browser instead of Baileys protocol\n');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('\n✅ QR CODE GENERATED! (Baileys couldn\'t do this!)');
    console.log('='.repeat(50));
    qrcode.generate(qr, {small: true});
    console.log('='.repeat(50));
    console.log('📱 Scan this QR code with WhatsApp\n');
});

client.on('ready', () => {
    console.log('\n🎉 SUCCESS! WhatsApp connected!');
    console.log('✅ whatsapp-web.js BYPASSED the 405 error!');
    console.log('✅ Your bot can work again!\n');
    process.exit(0);
});

client.on('authenticated', () => {
    console.log('✅ Authenticated successfully');
});

client.on('auth_failure', (error) => {
    console.error('❌ Authentication failed:', error);
    process.exit(1);
});

client.on('disconnected', (reason) => {
    console.log('⚠️ Disconnected:', reason);
});

console.log('🔄 Initializing WhatsApp Web client...');
console.log('⏳ This may take 30-60 seconds (downloading Chrome if needed)...\n');

client.initialize().catch(error => {
    console.error('❌ Failed to initialize:', error);
    process.exit(1);
});

// Timeout after 3 minutes
setTimeout(() => {
    console.log('\n⏰ Test timeout - taking too long');
    process.exit(1);
}, 180000);
