- each bug check first  in '/Users/michaelmishayev/Desktop/Projects/wAssitenceBot/docs/development/bugs.md' ,and if its new so log  the problem and solution for the problem
- do not push to git without my permission
- never deploy to directly to prod without git hub, only if i ask to
- each fix make qa test, update the qa tool
- always push to prod via git hub, never directly to ssh prod
- always mark fixed bugs
- after finish bug fix mark in redis as fixed and update local file

## 📊 How to Access Production Logs

### SSH to Production Server
```bash
ssh root@167.71.145.9
```

### Get User's Recent Messages
```bash
# Replace USER_PHONE with actual phone (e.g., 544345287)
ssh root@167.71.145.9 "tail -1000 /root/wAssitenceBot/logs/all.log | grep -i 'USER_PHONE' | tail -50"
```

### Get Today's Logs for Specific User
```bash
# Get all messages from today for user
ssh root@167.71.145.9 "grep '2025-11-17.*USER_PHONE' /root/wAssitenceBot/logs/all.log | tail -100"
```

### Get Error Logs
```bash
ssh root@167.71.145.9 "tail -200 /root/wAssitenceBot/logs/error.log"
```

### Check Production Redis (if needed)
Production Redis credentials are in `.env.production`:
- REDIS_URL in .env.production file
- Use these to connect via Redis client if needed

### Local Log Files (if synced from production)
- `/tmp/prod-messages.json` - Downloaded production messages (may be outdated)
- Update by downloading from production when needed