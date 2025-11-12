/**
 * Mark bugs #5, #7, #8, #13, #14, #15, #21 as fixed in production Redis
 * Commit: 65eb940
 */

import Redis from 'ioredis';

const PROD_REDIS_URL = 'redis://localhost:6379'; // Will connect to prod via SSH tunnel

async function markBugsAsFixed() {
  console.log('🔧 Connecting to production Redis...\n');

  const redis = new Redis(PROD_REDIS_URL);

  try {
    await redis.ping();
    console.log('✅ Connected to Redis\n');

    // Get all user messages
    const messagesJson = await redis.lrange('user_messages', 0, -1);
    console.log(`📨 Total messages: ${messagesJson.length}\n`);

    const bugsToFix = [
      {
        bugNumber: '#5',
        text: '#didnt understand the יום לפני',
        phone: '972544345287',
        date: '2025-11-04'
      },
      {
        bugNumber: '#7',
        text: '#asked to remind me day before a meeting, the meeting on 8.11, the reminder on 5.11, bug!',
        phone: '972544345287',
        date: '2025-11-04'
      },
      {
        bugNumber: '#8',
        text: '#the event scheduled for 7.11, asked for it to remind me a day before, it scheduler reminder for the 5.11, it\'s 2 days, not 1. Bug',
        phone: '972544345287',
        date: '2025-11-04'
      },
      {
        bugNumber: '#13',
        text: '#i asked: פגישה ב 21 עם דימה, להביא מחשב and it created event for 21/11/2025, why? When user uses only time without date, so it\'s for today.',
        phone: '972544345287',
        date: '2025-11-02'
      },
      {
        bugNumber: '#14',
        text: '#i have event at 21 today, why not seen it? It\'s abug',
        phone: '972544345287',
        date: '2025-11-02'
      },
      {
        bugNumber: '#15',
        text: '# לא מזהה שעה',
        phone: '972542101057',
        date: '2025-10-29'
      },
      {
        bugNumber: '#21',
        text: '#לא זיהה את השעה',
        phone: '972542101057',
        date: '2025-10-28'
      },
    ];

    console.log('═'.repeat(80));
    console.log('🐛 Marking Bugs as Fixed');
    console.log('═'.repeat(80));
    console.log('');

    const fixedTimestamp = new Date().toISOString();
    const commitHash = '65eb940';
    let fixedCount = 0;

    for (let i = 0; i < messagesJson.length; i++) {
      try {
        const msg = JSON.parse(messagesJson[i]);

        // Check if this message matches any of our bugs to fix
        const matchedBug = bugsToFix.find(bug => {
          const msgText = (msg.messageText || '').trim();
          const bugText = bug.text.trim();

          // Match by text similarity (contains key parts)
          const isTextMatch = msgText.includes(bugText.substring(0, 30)) ||
                              bugText.includes(msgText.substring(0, 30));

          // Also match by phone and approximate date
          const isPhoneMatch = msg.phone === bug.phone;

          return isTextMatch && isPhoneMatch && msg.status !== 'fixed';
        });

        if (matchedBug) {
          // Mark as fixed
          msg.status = 'fixed';
          msg.fixedAt = fixedTimestamp;
          msg.commitHash = commitHash;

          // Update in Redis
          await redis.lset('user_messages', i, JSON.stringify(msg));

          fixedCount++;
          console.log(`✅ Fixed ${matchedBug.bugNumber}: "${msg.messageText.substring(0, 50)}..."`);
          console.log(`   Phone: ${msg.phone}`);
          console.log(`   Date: ${new Date(msg.timestamp).toLocaleDateString('he-IL')}`);
          console.log(`   Commit: ${commitHash}\n`);
        }
      } catch (e) {
        // Skip invalid JSON
        continue;
      }
    }

    console.log('═'.repeat(80));
    console.log(`🎉 Marked ${fixedCount} bugs as fixed!`);
    console.log('═'.repeat(80));

    await redis.quit();

  } catch (error) {
    console.error('❌ Error:', error);
    await redis.quit();
    process.exit(1);
  }
}

markBugsAsFixed();
