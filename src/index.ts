// WhatsApp Assistant Bot - Entry Point
// This is a placeholder until we build the actual bot (Week 1-2 of DEV_PLAN.md)

const PORT = process.env.PORT || 3000;

console.log('🤖 WhatsApp Assistant Bot starting...');
console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
console.log(`🔴 Redis: ${process.env.REDIS_URL ? 'Connected' : 'Not configured'}`);

// Health check endpoint (for Railway to verify deployment)
const http = require('http');
const server = http.createServer((req: any, res: any) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      message: 'WhatsApp Bot is running (placeholder mode)',
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp Assistant Bot - Placeholder\nReady for development!\n');
  }
});

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log('\n📋 Next: Follow docs/DEV_PLAN.md Week 1 to start building!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
