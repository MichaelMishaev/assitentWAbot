import { parseHebrewDate } from './dist/utils/hebrewDateParser.js';
import { DateTime } from 'luxon';

console.log('Testing User Bug Report:');
console.log('Input: "פגישה ב 21 עם דימה, להביא מחשב"');
console.log('Expected: Today at 21:00 (not 21st of November)\n');

const result = parseHebrewDate('ב 21', 'Asia/Jerusalem');

if (result.success && result.date) {
  const dt = DateTime.fromJSDate(result.date).setZone('Asia/Jerusalem');
  console.log(`✅ SUCCESS: Parsed as ${dt.toFormat('dd/MM/yyyy HH:mm')}`);
  console.log(`   Date: ${dt.toFormat('dd/MM/yyyy')}`);
  console.log(`   Time: ${dt.toFormat('HH:mm')}`);
  console.log(`   Day: ${dt.toFormat('cccc')}`);

  const today = DateTime.now().setZone('Asia/Jerusalem').startOf('day');
  const tomorrow = today.plus({ days: 1 });
  const resultDay = dt.startOf('day');

  if (resultDay.equals(today)) {
    console.log('\n   ✅ Correctly interpreted as TODAY at 21:00');
  } else if (resultDay.equals(tomorrow)) {
    console.log('\n   ✅ Correctly interpreted as TOMORROW at 21:00 (time already passed today)');
  } else {
    console.log(`\n   ❌ ERROR: Interpreted as ${dt.toFormat('cccc dd/MM')} (should be today/tomorrow)`);
  }
} else {
  console.log(`❌ FAILED: ${result.error}`);
}
