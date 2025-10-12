# 🌐 Dashboard Domain Fix

## Problem

Dashboard URLs were using the server IP instead of the proper domain:

**Before** ❌:
```
http://167.71.145.9:8080/d/d1a95a0e945a4346bc96d531484ba430
```

**After** ✅:
```
https://ailo.digital/d/d1a95a0e945a4346bc96d531484ba430
```

---

## Root Cause

The `DASHBOARD_URL` environment variable was not properly configured in production.

**Code location**: `src/routing/NLPRouter.ts:1797-1815`

The code has proper fallback logic:
1. Try `process.env.DASHBOARD_URL` (highest priority)
2. Try `process.env.RAILWAY_PUBLIC_DOMAIN`
3. If production and neither set → ERROR
4. Development → localhost

The issue: `DASHBOARD_URL` had the old IP address instead of the domain.

---

## Solution

### 1. Created Configuration Script

**File**: `scripts/set-dashboard-domain.sh`

```bash
#!/bin/bash
# Sets DASHBOARD_URL to https://ailo.digital in production
```

### 2. Updated Production Environment

```bash
# Before
export DASHBOARD_URL=http://167.71.145.9:8080  # ❌ Old IP

# After
DASHBOARD_URL=https://ailo.digital  # ✅ Proper domain
```

### 3. Restarted PM2

```bash
pm2 restart ultrathink --update-env
```

---

## Verification

### Check Environment Variable
```bash
ssh root@167.71.145.9 "cd /root/wAssitenceBot && grep DASHBOARD_URL .env"
# Output: DASHBOARD_URL=https://ailo.digital ✅
```

### Test Dashboard Generation
When user requests dashboard, they will now receive:
```
✨ הלוח האישי שלך מוכן!

📊 צפה בכל האירועים והמשימות שלך בממשק נוח וצבעוני

https://ailo.digital/d/{token}

⏰ הקישור תקף ל-15 דקות בלבד
💡 ניתן לפתוח מכל מכשיר - מחשב, טאבלט או נייד
```

---

## Benefits

1. ✅ **Professional branding**: Uses custom domain instead of IP
2. ✅ **HTTPS by default**: Secure connection
3. ✅ **User trust**: Domain looks more legitimate than IP
4. ✅ **Easy to remember**: ailo.digital vs 167.71.145.9:8080

---

## Maintenance

### To change domain in future:
```bash
./scripts/set-dashboard-domain.sh
```

### To verify current domain:
```bash
ssh root@167.71.145.9 "grep DASHBOARD_URL /root/wAssitenceBot/.env"
```

---

## Related Files

- `src/routing/NLPRouter.ts:1784-1840` - Dashboard URL generation
- `scripts/set-dashboard-domain.sh` - Configuration script
- `.env` on production server - Environment variables

---

**Fixed**: 2025-10-12
**Commit**: 69eb971
**Status**: ✅ DEPLOYED
