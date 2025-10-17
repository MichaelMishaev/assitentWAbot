# 🐛 Bug Reporting System - Redis-Based

## Overview

A streamlined system for reporting and tracking bugs directly from WhatsApp. Users send messages starting with `#` to report issues, and Claude Code automatically finds and fixes them across all sessions.

## How It Works

### 1. User Reports a Bug (WhatsApp)

```
You: #when I ask what I have this month, show only future events
Bot: [processes message normally, no special response]
```

The message is **instantly saved to Redis** with `status: "pending"`.

### 2. Claude Code Finds Bugs

In **any Claude Code session**, you can ask:

```
You: "Find all # bug reports"
You: "Show me pending bugs"
You: "What bugs need fixing?"
```

Claude Code will use the helper functions to search Redis and display:

```javascript
import bugReportHelper from './src/utils/bugReportHelper.js';

// Get pending bugs
const bugs = await bugReportHelper.getPendingBugs();

// Display formatted
const output = await bugReportHelper.displayPendingBugs();
console.log(output);
```

**Output:**
```
🐛 Found 2 pending bugs:

1. [17.10.2025, 9:08] #when I ask what I have this month, show only future events
   User: 972544345287

2. [15.10.2025, 14:30] #reminders not showing past due items
   User: 972544345287
```

### 3. Claude Code Fixes the Bug

After implementing the fix:

```javascript
import bugReportHelper from './src/utils/bugReportHelper.js';

// Mark bug as fixed
await bugReportHelper.markBugAsFixed(
  '#when I ask what I have this month, show only future events',
  'abc123-git-commit-hash'  // Optional commit hash
);
```

### 4. Future Sessions Ignore Fixed Bugs

Next time you ask Claude Code to find bugs:

```javascript
const bugs = await bugReportHelper.getPendingBugs();
// Returns only bugs with status='pending'
// Fixed bugs are automatically filtered out!
```

---

## For Users (You)

### Reporting Bugs

Send a WhatsApp message starting with `#`:

```
#bug - comments not showing in event creation
#reminder time is wrong by 1 hour
#when I delete event, it shows again
```

**Tips:**
- Be specific about the issue
- Include context (what you did, what happened)
- No need to format perfectly - just start with `#`

### Checking Bug Status

Ask Claude Code:
- "Show me all my bug reports"
- "What bugs are still pending?"
- "What bugs were fixed recently?"

---

## For Claude Code (All Sessions)

### Finding Pending Bugs

```javascript
import bugReportHelper from './src/utils/bugReportHelper.js';

// Method 1: Get bugs programmatically
const bugs = await bugReportHelper.getPendingBugs();
console.log(`Found ${bugs.length} pending bugs`);

bugs.forEach(bug => {
  console.log(`- ${bug.text}`);
  console.log(`  User: ${bug.userId}`);
  console.log(`  Time: ${bug.timestamp}`);
});

// Method 2: Display formatted output
const output = await bugReportHelper.displayPendingBugs();
console.log(output);
```

### Marking Bugs as Fixed

After implementing the fix:

```javascript
// Single bug
await bugReportHelper.markBugAsFixed(
  '#when I ask what I have this month, show only future events',
  'abc123'  // Git commit hash (optional)
);

// Multiple bugs at once
const result = await bugReportHelper.fixBugsWorkflow(
  [
    '#bug - comments not showing',
    '#reminders wrong time'
  ],
  'def456'  // Commit hash (optional)
);

console.log(`Fixed: ${result.success}, Failed: ${result.failed}`);
```

### Getting Bug History

```javascript
const history = await bugReportHelper.getBugHistory();

console.log(`Total bugs: ${history.total}`);
console.log(`Pending: ${history.pending.length}`);
console.log(`Fixed: ${history.fixed.length}`);

// Fixed bugs include metadata
history.fixed.forEach(bug => {
  console.log(`- ${bug.text}`);
  console.log(`  Fixed: ${bug.fixedAt}`);
  console.log(`  Commit: ${bug.commitHash}`);
});
```

---

## Technical Details

### Data Structure

Messages in Redis (`user_messages` list):

```json
{
  "timestamp": "2025-10-17T09:08:00Z",
  "messageId": "msg-12345",
  "userId": "user-abc",
  "phone": "972544345287",
  "direction": "incoming",
  "messageText": "#when I ask what I have this month, show only future events",
  "status": "pending",
  "conversationState": "MAIN_MENU"
}
```

After fixing:

```json
{
  // ... same fields ...
  "status": "fixed",
  "fixedAt": "2025-10-17T10:30:00Z",
  "fixedBy": "claude-code",
  "commitHash": "abc123"
}
```

### Redis Keys

- `user_messages` - Main list of all messages (LIST)
- `bugs:pending` - Quick access to pending bugs (LIST)
- `bugs:fixed` - Historical record of fixed bugs (LIST)

### Persistence

- **Instant save**: No buffering, messages saved immediately to Redis
- **Crash-safe**: Redis persistence (AOF + RDB snapshots)
- **Survives restarts**: Data restored automatically when Redis restarts

---

## API Reference

### `bugReportHelper.getPendingBugs()`

Returns pending bug reports only.

```javascript
const bugs = await bugReportHelper.getPendingBugs();
// Returns: Array<{ timestamp, text, userId, phone, messageId }>
```

### `bugReportHelper.markBugAsFixed(bugText, commitHash?)`

Marks a bug as fixed.

```javascript
const success = await bugReportHelper.markBugAsFixed(
  '#bug text here',
  'optional-commit-hash'
);
// Returns: boolean (true if successful)
```

### `bugReportHelper.displayPendingBugs()`

Returns formatted string of pending bugs.

```javascript
const output = await bugReportHelper.displayPendingBugs();
console.log(output);
// Prints:
// 🐛 Found 2 pending bugs:
// 1. [date] #bug text...
```

### `bugReportHelper.getBugHistory()`

Returns all bugs (pending + fixed) with metadata.

```javascript
const history = await bugReportHelper.getBugHistory();
// Returns: { total, pending: [], fixed: [] }
```

### `bugReportHelper.fixBugsWorkflow(bugTexts[], commitHash?)`

Mark multiple bugs as fixed in one call.

```javascript
const result = await bugReportHelper.fixBugsWorkflow(
  ['#bug1', '#bug2'],
  'commit-hash'
);
// Returns: { success, failed, details: [] }
```

---

## Global Instructions

This system is documented in your `~/.claude/CLAUDE.md` file, so **all Claude Code sessions automatically know how to use it**.

When you ask any Claude Code session to "fix bugs", it will:
1. Search Redis for `status="pending"` bugs
2. Only show unfixed bugs
3. Mark bugs as `status="fixed"` after implementing the solution
4. Track commit hashes for traceability

---

## Testing

Run the test script:

```bash
npx tsx test-bug-reporting.ts
```

This will:
1. Create test bug reports
2. Search for them
3. Mark one as fixed
4. Verify only pending bugs are returned
5. Clean up test data

---

## Example Workflow

### Day 1
```
WhatsApp: #when I ask what I have this month, show only future events
→ Saved to Redis with status="pending"
```

### Day 1 (Later)
```
You: "Claude, find all # bug reports and fix them"
Claude: [Finds bug, implements fix, marks as fixed]
```

### Day 2
```
WhatsApp: #reminders not showing past events
→ Saved to Redis with status="pending"

You: "Claude, show pending bugs"
Claude: 🐛 Found 1 pending bug:
        1. #reminders not showing past events

        (Previous bug from Day 1 is NOT shown - it's already fixed!)
```

---

## Advantages

✅ **No lost bugs** - Instant Redis persistence
✅ **Cross-session** - All Claude Code sessions see the same bugs
✅ **No duplicates** - Fixed bugs are filtered out automatically
✅ **Traceability** - Commit hashes track when/where bugs were fixed
✅ **Simple UX** - Just type `#bug` in WhatsApp, that's it
✅ **Crash-safe** - Redis survives process crashes

---

## Notes

- Bug messages start with `#` (hashtag)
- The bot does **not respond** to `#` messages (they're just logged)
- Claude Code in **any session** can find and fix bugs
- Fixed bugs include timestamp, commit hash, and who fixed them
- System uses Redis for persistence, JSON files for backup
