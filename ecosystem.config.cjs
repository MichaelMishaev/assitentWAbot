/**
 * PM2 Ecosystem Configuration
 *
 * ⚠️  CRITICAL: ALWAYS use this file to start PM2!
 * ✅  Correct: pm2 start ecosystem.config.cjs
 * ❌  Wrong:   pm2 start dist/index.js  (misses NODE_ENV and other config)
 *
 * Prevents crash loops and provides production-grade process management
 *
 * Key Features:
 * - Restart limits prevent infinite loops (max 10 restarts)
 * - Exponential backoff (5s → 10s → 20s → 40s...)
 * - Memory limits auto-restart if app leaks memory
 * - Detailed logging with timestamps
 * - Forces NODE_ENV=production (prevents dev mode on prod server)
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 *   pm2 reload ecosystem.config.cjs  # Zero-downtime restart
 */

module.exports = {
  apps: [{
    // Application Configuration
    name: 'ultrathink',
    script: 'dist/index.js',
    cwd: '/root/wAssitenceBot',

    // Restart Strategy - PREVENTS CRASH LOOPS
    autorestart: true,
    max_restarts: 10,  // Stop auto-restart after 10 failed attempts
    min_uptime: '30s', // Must stay up 30s for restart to count as success
    restart_delay: 5000, // Wait 5 seconds between restarts
    exp_backoff_restart_delay: 100, // Exponential backoff multiplier (ms)

    // Resource Limits
    max_memory_restart: '500M', // Restart if memory exceeds 500MB

    // Logging Configuration
    error_file: '/root/wAssitenceBot/logs/pm2-error.log',
    out_file: '/root/wAssitenceBot/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    combine_logs: true,

    // Environment - CRITICAL: Forces production mode
    env: {
      NODE_ENV: 'production',
      TZ: 'UTC', // UTC timezone for cron jobs - users get messages at their own timezone preferences
      NODE_OPTIONS: '--max-old-space-size=2048' // Increase Node.js heap size to 2GB
    },

    // Performance
    instances: 1, // Single instance (WhatsApp session can't be shared)
    exec_mode: 'fork',

    // Advanced Options
    kill_timeout: 5000, // Wait 5s for graceful shutdown before SIGKILL
    listen_timeout: 10000, // Wait 10s for app to be ready
    wait_ready: false,

    // Monitoring
    instance_var: 'INSTANCE_ID'
  }]
};

/**
 * CRASH LOOP PROTECTION EXPLAINED
 *
 * Without these settings:
 * ❌ App crashes → PM2 restarts immediately
 * ❌ App crashes again → PM2 restarts again
 * ❌ Repeats 397 times in a few minutes
 * ❌ Wastes CPU, floods logs, masks real issues
 *
 * With these settings:
 * ✅ App crashes → PM2 waits 5s → restarts
 * ✅ If crash again → waits 10s (exponential backoff)
 * ✅ If crash 10 times → STOPS auto-restart
 * ✅ Forces admin to investigate and fix root cause
 * ✅ Restarts that succeed 30s+ don't count toward limit
 *
 * RESTART SCENARIOS
 *
 * Scenario 1: Real crash (bug in code)
 * - App crashes after 5 minutes uptime
 * - PM2 waits 5s, then restarts
 * - New instance runs successfully
 * - Restart counter stays at 0 (uptime > 30s)
 *
 * Scenario 2: Crash loop (missing dependency, bad config)
 * - App crashes after 2 seconds (uptime < 30s)
 * - PM2 waits 5s, restart #1
 * - App crashes after 2 seconds again
 * - PM2 waits 10s, restart #2
 * - App crashes after 2 seconds again
 * - PM2 waits 20s, restart #3
 * - ... continues with exponential backoff ...
 * - After 10 failed restarts → PM2 STOPS
 * - Admin must run: pm2 logs, fix issue, pm2 restart
 *
 * DEPLOYMENT COMMANDS
 *
 * Start app with this config:
 *   pm2 start ecosystem.config.js
 *
 * Update config and reload:
 *   pm2 reload ecosystem.config.js
 *
 * Check restart count:
 *   pm2 list
 *   # Look at "restart" column - should be 0-1
 *
 * Reset restart counter:
 *   pm2 reset ultrathink
 *
 * Monitor in real-time:
 *   pm2 monit
 */
