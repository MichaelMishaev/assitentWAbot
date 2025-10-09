import { readFile } from 'fs/promises';
import { DateTime } from 'luxon';

interface LogEntry {
  level: string;
  message: string;
  service: string;
  timestamp: string;
  userMessage?: string;
  intent?: string;
  confidence?: number;
  [key: string]: any;
}

interface MessageStat {
  timestamp: string;
  phone?: string;
  message: string;
  intent?: string;
  confidence?: number;
}

async function analyzeLogMessages() {
  try {
    console.log('📊 Analyzing Message Logs from JSON Files\n');

    // Read the all.log file
    const logContent = await readFile('./logs/all.log', 'utf-8');
    const lines = logContent.trim().split('\n');

    console.log(`📄 Total log entries: ${lines.length}\n`);

    // Parse JSON entries
    const entries: LogEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
      } catch (e) {
        // Skip invalid JSON lines
      }
    }

    console.log(`✅ Parsed ${entries.length} valid log entries\n`);

    // Filter for today (Oct 8 and Oct 9, 2025)
    const today = DateTime.fromISO('2025-10-09', { zone: 'Asia/Jerusalem' });
    const yesterday = today.minus({ days: 1 });

    const todayStr = today.toFormat('yyyy-MM-dd');
    const yesterdayStr = yesterday.toFormat('yyyy-MM-dd');

    // Extract received messages
    const receivedMessages: MessageStat[] = [];
    const nlpIntents: MessageStat[] = [];

    entries.forEach(entry => {
      // Check for received messages
      if (entry.message && entry.message.includes('📩 Received message from')) {
        const match = entry.message.match(/📩 Received message from (\d+): "(.*?)"/);
        if (match) {
          receivedMessages.push({
            timestamp: entry.timestamp,
            phone: match[1],
            message: match[2]
          });
        }
      }

      // Check for NLP parsed intents
      if (entry.message === 'NLP parsed intent' && entry.userMessage) {
        nlpIntents.push({
          timestamp: entry.timestamp,
          message: entry.userMessage,
          intent: entry.intent,
          confidence: entry.confidence
        });
      }
    });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 MESSAGE ANALYSIS REPORT');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`📅 Report Period: Last 7 days (up to ${todayStr})\n`);

    // Group by date
    const messagesByDate = new Map<string, MessageStat[]>();
    receivedMessages.forEach(msg => {
      const date = msg.timestamp.split(' ')[0];
      if (!messagesByDate.has(date)) {
        messagesByDate.set(date, []);
      }
      messagesByDate.get(date)!.push(msg);
    });

    console.log('📈 MESSAGES BY DATE');
    console.log('─────────────────────────────────────────────────────────────');
    const sortedDates = Array.from(messagesByDate.keys()).sort().reverse();
    sortedDates.forEach(date => {
      const msgs = messagesByDate.get(date)!;
      const uniquePhones = new Set(msgs.map(m => m.phone)).size;
      console.log(`${date}    ${msgs.length.toString().padStart(5)} messages    ${uniquePhones} unique users`);
    });
    console.log();

    // Today's messages
    const todayMessages = receivedMessages.filter(m => m.timestamp.startsWith(todayStr));
    console.log(`💬 TODAY (${todayStr}): ${todayMessages.length} messages`);
    console.log('─────────────────────────────────────────────────────────────');
    if (todayMessages.length > 0) {
      todayMessages.forEach((msg, idx) => {
        console.log(`${idx + 1}. [${msg.timestamp.split(' ')[1]}] ${msg.phone}: ${msg.message}`);
      });
    } else {
      console.log('No messages today');
    }
    console.log();

    // Yesterday's messages
    const yesterdayMessages = receivedMessages.filter(m => m.timestamp.startsWith(yesterdayStr));
    console.log(`💬 YESTERDAY (${yesterdayStr}): ${yesterdayMessages.length} messages`);
    console.log('─────────────────────────────────────────────────────────────');
    if (yesterdayMessages.length > 0) {
      yesterdayMessages.slice(0, 20).forEach((msg, idx) => {
        console.log(`${idx + 1}. [${msg.timestamp.split(' ')[1]}] ${msg.phone}: ${msg.message}`);
      });
      if (yesterdayMessages.length > 20) {
        console.log(`... and ${yesterdayMessages.length - 20} more messages`);
      }
    } else {
      console.log('No messages yesterday');
    }
    console.log();

    // Intent analysis
    const intentCounts = new Map<string, number>();
    nlpIntents.forEach(entry => {
      const intent = entry.intent || 'unknown';
      intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
    });

    console.log('🎯 TOP INTENTS (All Time)');
    console.log('─────────────────────────────────────────────────────────────');
    const sortedIntents = Array.from(intentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    sortedIntents.forEach(([intent, count], idx) => {
      const bar = '█'.repeat(Math.min(40, Math.ceil(count / 2)));
      console.log(`${(idx + 1).toString().padStart(2)}. ${intent.padEnd(20)} ${count.toString().padStart(5)} ${bar}`);
    });
    console.log();

    // Phone number activity
    const phoneActivity = new Map<string, number>();
    receivedMessages.forEach(msg => {
      if (msg.phone) {
        phoneActivity.set(msg.phone, (phoneActivity.get(msg.phone) || 0) + 1);
      }
    });

    console.log('👥 ACTIVE USERS');
    console.log('─────────────────────────────────────────────────────────────');
    const sortedPhones = Array.from(phoneActivity.entries())
      .sort((a, b) => b[1] - a[1]);

    sortedPhones.forEach(([phone, count], idx) => {
      const lastMsg = receivedMessages
        .filter(m => m.phone === phone)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      console.log(`${(idx + 1).toString().padStart(2)}. ${phone}    ${count.toString().padStart(5)} messages    Last: ${lastMsg.timestamp}`);
    });
    console.log();

    // Recent messages (last 30)
    console.log('📬 RECENT MESSAGES (Last 30)');
    console.log('─────────────────────────────────────────────────────────────');
    receivedMessages
      .slice(-30)
      .reverse()
      .forEach((msg, idx) => {
        const nlpEntry = nlpIntents.find(n =>
          n.message === msg.message &&
          Math.abs(DateTime.fromFormat(n.timestamp, 'yyyy-MM-dd HH:mm:ss').diff(
            DateTime.fromFormat(msg.timestamp, 'yyyy-MM-dd HH:mm:ss')
          ).as('seconds')) < 5
        );
        const intentInfo = nlpEntry ? ` [${nlpEntry.intent}]` : '';
        console.log(`${(idx + 1).toString().padStart(2)}. [${msg.timestamp}] ${msg.phone}${intentInfo}`);
        console.log(`    ${msg.message}\n`);
      });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📊 SUMMARY STATISTICS`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total Messages:        ${receivedMessages.length}`);
    console.log(`Unique Users:          ${phoneActivity.size}`);
    console.log(`Messages Today:        ${todayMessages.length}`);
    console.log(`Messages Yesterday:    ${yesterdayMessages.length}`);
    console.log(`Total Intents Parsed:  ${nlpIntents.length}`);
    console.log(`Unique Intents:        ${intentCounts.size}`);
    console.log(`Date Range:            ${sortedDates[sortedDates.length - 1]} to ${sortedDates[0]}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('💡 NOTE: Messages are stored in JSON log files, NOT in the database!');
    console.log('   Location: ./logs/all.log\n');

  } catch (error) {
    console.error('❌ Error analyzing logs:', error);
    process.exit(1);
  }
}

analyzeLogMessages();
