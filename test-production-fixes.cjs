const { NLPService } = require("./dist/services/NLPService.js");
const nlpService = new NLPService();

async function testBugs() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("🧪 PRODUCTION TEST SUITE - Bugs #23, #31, #32");
  console.log("═══════════════════════════════════════════════════════\n");

  const tests = [
    {
      name: "Bug #31 - Test 1: תזכורת ל[DATE] should be CREATE",
      input: "תזכורת ל 15.11 להתכונן למצגת למחר",
      expectedIntent: "create_reminder",
      bug: "#31"
    },
    {
      name: "Bug #31 - Test 2: קבע תזכורת should be CREATE",
      input: "קבע תזכורת ל 16:00 לנסוע הביתה",
      expectedIntent: "create_reminder",
      bug: "#31"
    },
    {
      name: "Bug #31 - Test 3: עדכן תזכורת should be UPDATE",
      input: "עדכן תזכורת להתכונן למצגת",
      expectedIntent: "update_reminder",
      bug: "#31"
    },
    {
      name: "Bug #23 - Test 1: תזכיר לי מחר (no לפני)",
      input: "תזכיר לי מחר ב2 לעשות לסמי ביטוח וניירת",
      expectedIntent: "create_reminder",
      checkLeadTime: "undefined",
      bug: "#23"
    },
    {
      name: "Bug #23 - Test 2: תזכיר לי יום לפני (explicit)",
      input: "פגישה מחר בשעה 3, תזכיר לי יום לפני",
      expectedIntent: "create_reminder",
      checkLeadTime: 1440,
      bug: "#23"
    }
  ];

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const test of tests) {
    try {
      console.log(`\n📝 Test: ${test.name}`);
      console.log(`   Input: "${test.input}"`);

      const result = await nlpService.parseIntent(test.input, [], "Asia/Jerusalem");

      console.log(`   Result Intent: ${result.intent}`);
      console.log(`   Expected: ${test.expectedIntent}`);

      let testPassed = true;
      let notes = [];

      if (result.intent === test.expectedIntent) {
        console.log(`   ✅ PASS - Intent correct`);
        notes.push("Intent correct");

        if (test.checkLeadTime !== undefined) {
          const leadTime = result.reminder?.leadTimeMinutes;
          console.log(`   Lead Time: ${leadTime !== undefined ? leadTime : "undefined"}`);
          console.log(`   Expected: ${test.checkLeadTime}`);

          if (test.checkLeadTime === "undefined" && leadTime === undefined) {
            console.log(`   ✅ Lead time check PASS`);
            notes.push("Lead time correct (undefined)");
          } else if (test.checkLeadTime === 1440 && leadTime === 1440) {
            console.log(`   ✅ Lead time check PASS`);
            notes.push("Lead time correct (1440)");
          } else {
            console.log(`   ⚠️  Lead time mismatch: got ${leadTime}, expected ${test.checkLeadTime}`);
            notes.push(`Lead time mismatch: ${leadTime} vs ${test.checkLeadTime}`);
            testPassed = false;
          }
        }
      } else {
        console.log(`   ❌ FAIL - Intent mismatch!`);
        notes.push(`Intent mismatch: got ${result.intent}`);
        testPassed = false;
      }

      if (testPassed) {
        passed++;
      } else {
        failed++;
      }

      results.push({
        test: test.name,
        bug: test.bug,
        input: test.input,
        passed: testPassed,
        notes: notes.join(", ")
      });

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
      results.push({
        test: test.name,
        bug: test.bug,
        input: test.input,
        passed: false,
        notes: `Error: ${error.message}`
      });
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`📊 TEST RESULTS:`);
  console.log(`   ✅ Passed: ${passed}/${tests.length}`);
  console.log(`   ❌ Failed: ${failed}/${tests.length}`);
  console.log(`   Success Rate: ${Math.round((passed/tests.length)*100)}%`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  console.log(`\n📋 DETAILED RESULTS:\n`);
  results.forEach((r, i) => {
    const icon = r.passed ? "✅" : "❌";
    console.log(`${i+1}. ${icon} ${r.test}`);
    console.log(`   Bug: ${r.bug}`);
    console.log(`   Input: "${r.input}"`);
    console.log(`   Result: ${r.notes}\n`);
  });

  process.exit(failed > 0 ? 1 : 0);
}

testBugs().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
