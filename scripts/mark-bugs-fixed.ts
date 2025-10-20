import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

interface UserMessage {
  timestamp: string;
  messageText: string;
  userId: string;
  phone: string;
  direction: string;
  status?: string;
  fixedAt?: string;
  commitHash?: string;
}

async function markBugsFixed() {
  try {
    console.log('📋 Fetching all user messages from Redis...');

    // Get all messages
    const messages = await redis.lrange('user_messages', 0, -1);
    console.log(`Found ${messages.length} total messages`);

    // Fixed bugs mapping (based on bugs.md)
    const fixedBugs = [
      {
        pattern: /הוא לא מצליח לאתר אירוע לפי שם/,
        bugNumber: '#1',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3' // From git log
      },
      {
        pattern: /הוא לא בין את הבקשה/,
        bugNumber: '#5',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /why the bit recognized 2 participants/,
        bugNumber: '#2',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /הצלחתי להכניס את הפגישה אבל הוא התייחס רק לתאריך/,
        bugNumber: '#3',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /ניסיתי לבלבל אותו עם היום והתאריך/,
        bugNumber: '#3',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /הוא לא מוצא את האירוע/,
        bugNumber: '#1',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /רשם לי שהתאריך בעבר/,
        bugNumber: '#9',
        fixedDate: '2025-10-18',
        commitHash: 'd609e00'
      },
      {
        pattern: /ביקשתי תזכורת הוא לא מזהה/,
        bugNumber: '#8',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /ביקשתי תזכורת להובלה יום לפני/,
        bugNumber: '#8',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /צריך להוסיף שנה/,
        bugNumber: '#9',
        fixedDate: '2025-10-18',
        commitHash: 'd609e00'
      },
      {
        pattern: /ניסית למחוק את כל האירועים/,
        bugNumber: 'Not in bugs.md',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /for reminders if time not set.*set default 12:00/,
        bugNumber: '#12',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /its bug/,
        bugNumber: 'Generic',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /why didn't find ריקודים/,
        bugNumber: '#14',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      },
      {
        pattern: /i asked for specific hour and it didn't recognica/,
        bugNumber: '#13',
        fixedDate: '2025-10-19',
        commitHash: 'a083ea3'
      }
    ];

    let updatedCount = 0;

    // Process each message
    for (let i = 0; i < messages.length; i++) {
      const msgStr = messages[i];
      const msg: UserMessage = JSON.parse(msgStr);

      // Skip if not a bug report (doesn't start with #)
      if (!msg.messageText.startsWith('#')) continue;

      // Skip if already marked as fixed
      if (msg.status === 'fixed') continue;

      // Check if this bug matches any fixed bug
      const matchedBug = fixedBugs.find(bug => bug.pattern.test(msg.messageText));

      if (matchedBug) {
        console.log(`\n✅ Marking as FIXED: "${msg.messageText.substring(0, 50)}..."`);
        console.log(`   Bug: ${matchedBug.bugNumber} | Fixed: ${matchedBug.fixedDate} | Commit: ${matchedBug.commitHash}`);

        // Update the message
        msg.status = 'fixed';
        msg.fixedAt = matchedBug.fixedDate;
        msg.commitHash = matchedBug.commitHash;

        // Update in Redis
        await redis.lset('user_messages', i, JSON.stringify(msg));
        updatedCount++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total messages: ${messages.length}`);
    console.log(`   Bugs marked as fixed: ${updatedCount}`);

    // Show remaining pending bugs
    const remainingMessages = await redis.lrange('user_messages', 0, -1);
    const pendingBugs = remainingMessages
      .map(m => JSON.parse(m))
      .filter((m: UserMessage) => m.messageText.startsWith('#') && m.status !== 'fixed');

    console.log(`\n⚠️  Remaining pending bugs: ${pendingBugs.length}`);
    if (pendingBugs.length > 0) {
      console.log('\n📋 Pending bugs:');
      pendingBugs.forEach((bug: UserMessage) => {
        console.log(`   - [${bug.timestamp.substring(0, 10)}] ${bug.messageText.substring(0, 60)}`);
      });
    }

    await redis.quit();
    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error);
    await redis.quit();
    process.exit(1);
  }
}

markBugsFixed();
