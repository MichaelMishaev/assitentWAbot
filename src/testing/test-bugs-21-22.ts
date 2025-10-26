/**
 * QA TESTS FOR BUG #21 & #22
 *
 * Bug #21: Relative time parsing ("עוד דקה", "עוד 2 דקות") marked as past date
 * Bug #22: Bulk delete commands not recognized ("מחק הכל", "מחק 1,2,3")
 *
 * Date: 2025-10-26
 */

import { parseHebrewDate } from '../utils/hebrewDateParser.js';
import { DateTime } from 'luxon';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 QA TESTS: Bug #21 & #22');
console.log('═══════════════════════════════════════════════════════\n');

// Test Bug #21: Relative time parsing (minutes and hours)
console.log('📋 BUG #21: Relative Time Parsing\n');

const now = DateTime.now().setZone('Asia/Jerusalem');

// Test Case 1: "עוד דקה" (in 1 minute)
console.log('Test 1: "עוד דקה" (in 1 minute)');
const test1 = parseHebrewDate('עוד דקה');
if (test1.success && test1.date) {
  const result = DateTime.fromJSDate(test1.date).setZone('Asia/Jerusalem');
  const expected = now.plus({ minutes: 1 });
  const diffMinutes = result.diff(expected, 'minutes').minutes;

  console.log(`  Input: "עוד דקה"`);
  console.log(`  Result: ${result.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Expected: ${expected.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Difference: ${Math.round(diffMinutes)} minutes`);
  console.log(`  ✅ ${Math.abs(diffMinutes) < 1 ? 'PASS' : 'FAIL'}\n`);
} else {
  console.log(`  ❌ FAIL: ${test1.error}\n`);
}

// Test Case 2: "עוד 2 דקות" (in 2 minutes)
console.log('Test 2: "עוד 2 דקות" (in 2 minutes)');
const test2 = parseHebrewDate('עוד 2 דקות');
if (test2.success && test2.date) {
  const result = DateTime.fromJSDate(test2.date).setZone('Asia/Jerusalem');
  const expected = now.plus({ minutes: 2 });
  const diffMinutes = result.diff(expected, 'minutes').minutes;

  console.log(`  Input: "עוד 2 דקות"`);
  console.log(`  Result: ${result.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Expected: ${expected.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Difference: ${Math.round(diffMinutes)} minutes`);
  console.log(`  ✅ ${Math.abs(diffMinutes) < 1 ? 'PASS' : 'FAIL'}\n`);
} else {
  console.log(`  ❌ FAIL: ${test2.error}\n`);
}

// Test Case 3: "עוד 30 דקות" (in 30 minutes)
console.log('Test 3: "עוד 30 דקות" (in 30 minutes)');
const test3 = parseHebrewDate('עוד 30 דקות');
if (test3.success && test3.date) {
  const result = DateTime.fromJSDate(test3.date).setZone('Asia/Jerusalem');
  const expected = now.plus({ minutes: 30 });
  const diffMinutes = result.diff(expected, 'minutes').minutes;

  console.log(`  Input: "עוד 30 דקות"`);
  console.log(`  Result: ${result.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Expected: ${expected.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Difference: ${Math.round(diffMinutes)} minutes`);
  console.log(`  ✅ ${Math.abs(diffMinutes) < 1 ? 'PASS' : 'FAIL'}\n`);
} else {
  console.log(`  ❌ FAIL: ${test3.error}\n`);
}

// Test Case 4: "עוד שעה" (in 1 hour)
console.log('Test 4: "עוד שעה" (in 1 hour)');
const test4 = parseHebrewDate('עוד שעה');
if (test4.success && test4.date) {
  const result = DateTime.fromJSDate(test4.date).setZone('Asia/Jerusalem');
  const expected = now.plus({ hours: 1 });
  const diffMinutes = result.diff(expected, 'minutes').minutes;

  console.log(`  Input: "עוד שעה"`);
  console.log(`  Result: ${result.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Expected: ${expected.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Difference: ${Math.round(diffMinutes)} minutes`);
  console.log(`  ✅ ${Math.abs(diffMinutes) < 1 ? 'PASS' : 'FAIL'}\n`);
} else {
  console.log(`  ❌ FAIL: ${test4.error}\n`);
}

// Test Case 5: "עוד 3 שעות" (in 3 hours)
console.log('Test 5: "עוד 3 שעות" (in 3 hours)');
const test5 = parseHebrewDate('עוד 3 שעות');
if (test5.success && test5.date) {
  const result = DateTime.fromJSDate(test5.date).setZone('Asia/Jerusalem');
  const expected = now.plus({ hours: 3 });
  const diffMinutes = result.diff(expected, 'minutes').minutes;

  console.log(`  Input: "עוד 3 שעות"`);
  console.log(`  Result: ${result.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Expected: ${expected.toFormat('dd/MM/yyyy HH:mm:ss')}`);
  console.log(`  Difference: ${Math.round(diffMinutes)} minutes`);
  console.log(`  ✅ ${Math.abs(diffMinutes) < 1 ? 'PASS' : 'FAIL'}\n`);
} else {
  console.log(`  ❌ FAIL: ${test5.error}\n`);
}

console.log('═══════════════════════════════════════════════════════');
console.log('\n📋 BUG #22: Bulk Delete Commands (Manual Test Plan)\n');

console.log(`MANUAL TEST STEPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Setup:
1. Create 5 test events in the bot
2. Query events with "מה יש לי היום" to get event list message

Test Case 1: Delete All Events
────────────────────────────────
1. Reply to the event list message with "מחק הכל"
2. ✅ Expect: Confirmation message showing all 5 events
3. Reply "כן" to confirm
4. ✅ Expect: "✅ 5 אירועים נמחקו בהצלחה"
5. ✅ Expect: All events deleted from database

Test Case 2: Delete Specific Events (Comma-Separated)
────────────────────────────────────────────────────
1. Create 5 new test events
2. Query events with "מה יש לי היום"
3. Reply to the event list message with "מחק 1,3,5"
4. ✅ Expect: Confirmation message showing events #1, #3, #5
5. Reply "כן" to confirm
6. ✅ Expect: "✅ 3 אירועים נמחקו בהצלחה"
7. ✅ Expect: Only events #2 and #4 remain

Test Case 3: Delete All with Alternative Phrasing
────────────────────────────────────────────────
1. Query events
2. Reply with "מחק את כל"
3. ✅ Expect: Confirmation message with event list
4. Reply "לא" to cancel
5. ✅ Expect: "ℹ️ מחיקת האירועים בוטלה."
6. ✅ Expect: All events still exist

Test Case 4: Invalid Number Range
────────────────────────────────
1. Create 3 events
2. Query events
3. Reply with "מחק 1,2,5"
4. ✅ Expect: Only events #1 and #2 deleted (event #5 doesn't exist)
5. ✅ Expect: "✅ 2 אירועים נמחקו בהצלחה"

Test Case 5: Single Number Still Works
────────────────────────────────────────
1. Query events
2. Reply with "מחק 1"
3. ✅ Expect: Single delete confirmation (existing behavior)
4. ✅ Expect: Standard single-delete flow

Expected Redis Keys:
────────────────────
- temp:bulk_delete_confirm:{userId} (60s TTL)
  Structure: { eventIds: [...], count: N, phone: "..." }

Expected Log Entries:
────────────────────
- [BUG_FIX_22] Delete all events from reply
- [BUG_FIX_22] Multiple events selected via comma-separated numbers
- [BUG_FIX_22] Bulk delete confirmation requested
- [BUG_FIX_22] Bulk delete confirmed
- [BUG_FIX_22] Bulk delete cancelled

Expected Analytics Events:
────────────────────────────
- analytics: 'bulk_delete_confirmed'
- analytics: 'bulk_delete_cancelled'
`);

console.log('\n═══════════════════════════════════════════════════════');
console.log('✅ Test execution complete');
console.log('═══════════════════════════════════════════════════════\n');
