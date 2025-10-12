# Deployment Automation & Monitoring

**Created:** October 7, 2025
**Status:** ✅ Production Ready

## Overview

Comprehensive deployment and monitoring system with WhatsApp notifications for production deployments.

---

## 🚀 Deployment Script

### `scripts/deploy-production.sh`

Automated deployment script that:
- ✅ Builds locally first
- ✅ Checks for uncommitted changes
- ✅ Pushes to GitHub
- ✅ Creates backup on server
- ✅ Pulls latest code
- ✅ Installs dependencies
- ✅ **Detects if QR code scan is needed**
- ✅ **Sends WhatsApp notifications**
- ✅ Checks for errors in logs
- ✅ Validates app is running

### Usage

```bash
# From project root
./scripts/deploy-production.sh
```

### Features

#### 1. **Pre-flight Checks**
```bash
📦 Building locally...
🔍 Checking for uncommitted changes...
📤 Pushing to GitHub...
🌐 Connecting to server...
```

#### 2. **Safe Deployment**
```bash
💾 Creating backup...              # Auto-backup before deployment
⬇️  Pulling latest code...          # Fetches from GitHub
🔨 Installing dependencies...       # npm install + build
```

#### 3. **QR Code Detection** 🔐
Automatically detects if WhatsApp needs re-authentication:

```bash
🔐 Checking authentication status...
⚠️  QR CODE REQUIRED!
```

**Sends WhatsApp notification:**
```
⚠️ Deployment Notification

DEPLOYMENT PAUSED: QR code scan required!

Run: ssh root@167.71.145.9
Then: pm2 logs ultrathink
Scan QR code with WhatsApp

Time: 2025-10-07 15:30:00
```

#### 4. **Success/Failure Notifications**

**On Success:**
```
✅ Deployment Notification

Deployment completed successfully!

Branch: main
Status: online

Time: 2025-10-07 15:35:00
```

**On Failure:**
```
❌ Deployment Notification

Deployment FAILED at step: npm run build

Time: 2025-10-07 15:30:00
```

**On Errors:**
```
⚠️ Deployment Notification

Deployment completed but found 5 errors in logs.
Check: pm2 logs ultrathink

Time: 2025-10-07 15:35:00
```

### Configuration

Edit these variables in the script:

```bash
SERVER="root@167.71.145.9"          # Your server IP
APP_DIR="/root/wAssitenceBot"       # App directory
PM2_APP_NAME="ultrathink"           # PM2 process name
YOUR_PHONE="972555030746"           # Your WhatsApp number
```

---

## 🏥 Health Monitoring Script

### `scripts/health-monitor.sh`

Continuous health monitoring with automatic recovery and WhatsApp alerts.

### Setup

**Install on server:**

```bash
# Copy script to server
scp scripts/health-monitor.sh root@167.71.145.9:/root/wAssitenceBot/scripts/
ssh root@167.71.145.9 "chmod +x /root/wAssitenceBot/scripts/health-monitor.sh"

# Add to crontab (runs every 5 minutes)
ssh root@167.71.145.9
crontab -e

# Add this line:
*/5 * * * * /root/wAssitenceBot/scripts/health-monitor.sh >> /var/log/bot-health.log 2>&1
```

### Monitoring Checks

#### 1. **Process Status**
- Checks if PM2 process exists
- Verifies status is "online"
- **Auto-restarts if offline**

**Alert on failure:**
```
🚨 Bot Health Alert

CRITICAL: Bot process not found in PM2!

Action required:
1. SSH to server
2. Check: pm2 list
3. Restart: pm2 restart ultrathink

Time: 2025-10-07 15:30:00
```

#### 2. **Memory Usage**
- Monitors memory consumption
- Alerts if > 500MB

**Alert example:**
```
⚠️ Bot Health Alert

WARNING: High memory usage!

Current: 523MB

Monitoring...

Time: 2025-10-07 15:30:00
```

#### 3. **Restart Count**
- Tracks restart frequency
- Alerts if > 5 restarts

**Alert example:**
```
⚠️ Bot Health Alert

WARNING: Bot has restarted 8 times!

Check logs:
pm2 logs ultrathink --err

Time: 2025-10-07 15:30:00
```

#### 4. **Error Rate**
- Scans recent logs for errors
- Alerts if > 10 errors

**Alert example:**
```
⚠️ Bot Health Alert

WARNING: High error rate detected!

15 errors in recent logs

Check: pm2 logs ultrathink

Time: 2025-10-07 15:30:00
```

#### 5. **WhatsApp Connection**
- Checks for active connection
- Alerts on disconnection

**Alert example:**
```
⚠️ Bot Health Alert

WARNING: WhatsApp disconnected!

May need QR code rescan.

Check: pm2 logs ultrathink

Time: 2025-10-07 15:30:00
```

#### 6. **Auto-Recovery**
When issues are resolved automatically:

```
✅ Bot Health Alert

Bot health restored!

Status: Online
Memory: 115MB
Restarts: 2

All systems normal.

Time: 2025-10-07 15:35:00
```

### Smart State Tracking

The script maintains state to avoid duplicate alerts:

```bash
STATE_FILE="/tmp/bot-health-state"

States:
- online           # Normal operation
- offline          # Process stopped
- not_found        # PM2 process missing
- high_memory      # Memory > 500MB
- frequent_restarts # > 5 restarts
- high_errors      # > 10 errors
- disconnected     # WhatsApp disconnected
```

Only sends alerts when **state changes**, preventing notification spam.

---

## 📋 Complete Deployment Workflow

### Initial Deployment

```bash
# 1. On local machine
./scripts/deploy-production.sh

# 2. If QR code needed (notification received)
ssh root@167.71.145.9
cd /root/wAssitenceBot
pm2 logs ultrathink
# Scan QR code with WhatsApp

# 3. Confirm deployment completed
```

### Regular Updates

```bash
# Just run the script
./scripts/deploy-production.sh

# Script handles everything:
# - Build
# - Deploy
# - Check health
# - Send notifications
```

### Setting Up Monitoring

```bash
# One-time setup on server
ssh root@167.71.145.9

# Install jq (required for monitoring)
apt install -y jq bc

# Copy health monitor
cd /root/wAssitenceBot
chmod +x scripts/health-monitor.sh

# Test it
./scripts/health-monitor.sh

# Add to crontab
crontab -e
# Add: */5 * * * * /root/wAssitenceBot/scripts/health-monitor.sh >> /var/log/bot-health.log 2>&1

# Verify cron job
crontab -l
```

---

## 🔔 Notification Examples

### Daily Operations

You'll receive WhatsApp notifications for:

**Deployments:**
- ✅ Successful deployment
- ❌ Failed deployment
- ⚠️ QR code required
- ⚠️ Errors detected

**Health Monitoring:**
- 🚨 Process crashed
- ⚠️ High memory/errors
- ⚠️ Connection lost
- ✅ Auto-recovery successful

### Example Notification Flow

```
15:30 → ℹ️ Deployment starting...
15:32 → ⚠️ QR code required
15:35 → ✅ Deployment complete
15:40 → ⚠️ High memory usage
15:45 → ✅ Memory normalized
```

---

## 🛠️ Troubleshooting

### Deployment Script Issues

**Problem: "Cannot connect to server"**
```bash
# Test SSH connection
ssh root@167.71.145.9

# Add SSH key if needed
ssh-copy-id root@167.71.145.9
```

**Problem: "WhatsApp notification failed"**
```bash
# Check bot is running on server
ssh root@167.71.145.9 "pm2 status ultrathink"

# Check logs
ssh root@167.71.145.9 "pm2 logs ultrathink --lines 50"
```

### Health Monitor Issues

**Problem: Not receiving alerts**
```bash
# Check cron job is running
ssh root@167.71.145.9 "crontab -l"

# Check logs
ssh root@167.71.145.9 "tail -f /var/log/bot-health.log"

# Test manually
ssh root@167.71.145.9 "/root/wAssitenceBot/scripts/health-monitor.sh"
```

**Problem: Too many alerts**
```bash
# Adjust thresholds in health-monitor.sh:
MEMORY_MB > 500      # Increase to 1000
ERROR_COUNT > 10     # Increase to 20
RESTARTS > 5         # Increase to 10
```

### Dependencies

Both scripts require:

**Local machine:**
- `git`
- `npm`
- `jq` (optional)

**Server:**
- `pm2`
- `jq` (for monitoring)
- `bc` (for calculations)

Install on server:
```bash
ssh root@167.71.145.9 "apt install -y jq bc"
```

---

## 🔐 Security Considerations

### Phone Number Exposure
- Phone numbers are in script files
- **Do not commit with real numbers**
- Use environment variables:

```bash
# In script
YOUR_PHONE="${ADMIN_PHONE:-972555030746}"

# Run with:
ADMIN_PHONE="972555030746" ./scripts/deploy-production.sh
```

### SSH Access
- Scripts require SSH access to server
- Use SSH keys (not passwords)
- Consider IP whitelisting

### Notification Privacy
- Messages contain server details
- Only send to trusted numbers
- Consider encrypting sensitive data

---

## 📊 Monitoring Dashboard

### Quick Status Check

```bash
# Check everything at once
ssh root@167.71.145.9 << 'EOF'
echo "=== PM2 Status ==="
pm2 status

echo -e "\n=== Memory Usage ==="
pm2 jlist | jq '.[] | select(.name=="ultrathink") | .monit'

echo -e "\n=== Recent Logs ==="
pm2 logs ultrathink --nostream --lines 10

echo -e "\n=== Health State ==="
cat /tmp/bot-health-state

echo -e "\n=== Uptime ==="
uptime
EOF
```

### Log Analysis

```bash
# Error summary
ssh root@167.71.145.9 "pm2 logs ultrathink --nostream --lines 1000 --err | grep -i error | sort | uniq -c | sort -rn"

# Connection events
ssh root@167.71.145.9 "pm2 logs ultrathink --nostream --lines 500 | grep -i 'connect\|disconnect' | tail -20"

# Performance metrics
ssh root@167.71.145.9 "pm2 describe ultrathink | grep -A5 'Metadata'"
```

---

## 🎯 Best Practices

### Deployment
1. Always test locally first (`npm run build`)
2. Use the deployment script (don't SSH manually)
3. Check logs after deployment
4. Keep QR code scanner ready

### Monitoring
1. Review health alerts daily
2. Investigate high restart counts
3. Monitor memory trends
4. Keep cron logs clean

### Maintenance
1. Update scripts when changing server config
2. Test notification system monthly
3. Review and adjust alert thresholds
4. Keep deployment logs

---

## 📝 Future Enhancements

- [ ] Slack/Telegram notification support
- [ ] Deployment rollback capability
- [ ] Performance metrics dashboard
- [ ] Automated QR code screenshot upload
- [ ] Multi-server deployment support
- [ ] Docker container health checks
- [ ] Database migration validation
- [ ] Blue-green deployment strategy

---

## 🎉 Summary

You now have:

✅ **Automated deployment** with safety checks
✅ **QR code detection** with notifications
✅ **Health monitoring** every 5 minutes
✅ **WhatsApp alerts** for critical issues
✅ **Auto-recovery** for common problems
✅ **Complete documentation** for troubleshooting

**No more surprises - you'll know immediately if something goes wrong!**
