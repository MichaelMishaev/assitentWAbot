# 🐛 Claude Code - Bug Report Commands (Quick Reference)

## What You Say to Claude Code

### Finding Bugs
```
"Find all # bug reports"
"Show me pending bugs"
"What bugs need fixing?"
"List all bug reports"
```

### After Fixing
```
"Mark this bug as fixed: #bug text here"
"I fixed the bug about future events, mark it done"
```

### History
```
"Show me bug history"
"What bugs were fixed?"
"Show all bugs (pending and fixed)"
```

---

## What Claude Code Will Do

### 1. Search for Bugs
```javascript
import bugReportHelper from './src/utils/bugReportHelper.js';

const bugs = await bugReportHelper.getPendingBugs();
// or
const output = await bugReportHelper.displayPendingBugs();
console.log(output);
```

### 2. Mark as Fixed
```javascript
await bugReportHelper.markBugAsFixed(
  '#bug text here',
  'git-commit-hash'
);
```

### 3. Get History
```javascript
const history = await bugReportHelper.getBugHistory();
```

---

## How the System Works

1. **You send**: `#bug message` in WhatsApp
2. **System saves**: Message to Redis with `status="pending"`
3. **Claude finds**: Uses `getPendingBugs()` to get only unfixed bugs
4. **Claude fixes**: Implements the fix in code
5. **Claude marks**: Uses `markBugAsFixed()` to update status
6. **Next session**: Fixed bugs are automatically hidden

---

## Key Points

✅ All Claude Code sessions share the same bug list (via Redis)
✅ Fixed bugs are never shown again (filtered by `status!='fixed'`)
✅ No need to re-explain the system - it's in your global `~/.claude/CLAUDE.md`
✅ Crash-safe - Redis persists everything

---

## Files to Know

- `src/services/RedisMessageLogger.ts` - Core logger
- `src/utils/bugReportHelper.ts` - Helper functions for Claude
- `docs/BUG_REPORTING_SYSTEM.md` - Full documentation
- `~/.claude/CLAUDE.md` - Global instructions (auto-loaded)

---

**You're all set! Just say "#bug" in WhatsApp and ask Claude to fix it later.**
