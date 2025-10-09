/**
 * Real-Time Production Message Monitor
 *
 * Monitors production logs for user messages and validates fixes are working.
 * Specifically watches for the messages that failed on Oct 8, 2025.
 *
 * Features:
 * - Real-time log tailing from production server
 * - Highlights messages matching the failing patterns
 * - Shows NLP intent classification
 * - Shows time extraction results
 * - Color-coded output for easy debugging
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Patterns to watch for (user's failing messages)
const watchPatterns = [
  {
    pattern: /ימי ראשון|ביום ראשון|יום ראשון/,
    name: 'Day-of-Week Query',
    description: 'User asking about Sundays',
    expectIntent: 'list_events',
    color: colors.cyan
  },
  {
    pattern: /תזכורת.*ל \d{1,2}:\d{2}|תעדכן.*ל \d{1,2}:\d{2}/,
    name: 'Update Reminder (ל format)',
    description: 'Time with "ל" prefix (no שעה)',
    expectIntent: 'update_reminder',
    color: colors.magenta
  },
  {
    pattern: /עדכן.*אימון|עדכן.*ללכת לאימון/,
    name: 'Update Training Reminder',
    description: 'Updating training reminder',
    expectIntent: 'update_reminder',
    color: colors.yellow
  },
  {
    pattern: /לשעה \d{1,2}:\d{2}/,
    name: 'Time Extraction',
    description: 'Time in "לשעה XX:XX" format',
    expectIntent: null,
    color: colors.green
  },
];

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  phone?: string;
  intent?: string;
  confidence?: number;
  userMessage?: string;
  data?: any;
}

/**
 * Parse JSON log line
 */
function parseLogLine(line: string): LogEntry | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Check if message matches any watch pattern
 */
function checkPatterns(text: string): Array<{ name: string; description: string; color: string; expectIntent: string | null }> {
  const matches: Array<{ name: string; description: string; color: string; expectIntent: string | null }> = [];

  for (const pattern of watchPatterns) {
    if (pattern.pattern.test(text)) {
      matches.push({
        name: pattern.name,
        description: pattern.description,
        color: pattern.color,
        expectIntent: pattern.expectIntent
      });
    }
  }

  return matches;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Display a user message with analysis
 */
function displayUserMessage(entry: LogEntry, matches: Array<{ name: string; description: string; color: string; expectIntent: string | null }>): void {
  const time = formatTimestamp(entry.timestamp);
  const phone = entry.phone ? entry.phone.slice(-4) : '****';

  console.log(`\n${colors.bright}${colors.white}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}📩 INCOMING MESSAGE${colors.reset} ${colors.dim}[${time}]${colors.reset} ${colors.blue}from ...${phone}${colors.reset}`);
  console.log(`${colors.white}═══════════════════════════════════════════════════════${colors.reset}`);

  // Display message text
  console.log(`${colors.bright}Message:${colors.reset} "${entry.message || entry.userMessage}"`);

  // Display matches
  if (matches.length > 0) {
    console.log(`\n${colors.yellow}⚡ WATCHED PATTERNS DETECTED:${colors.reset}`);
    matches.forEach((match, index) => {
      console.log(`  ${match.color}${index + 1}. ${match.name}${colors.reset}`);
      console.log(`     ${colors.dim}→ ${match.description}${colors.reset}`);
      if (match.expectIntent) {
        console.log(`     ${colors.dim}→ Expected Intent: ${colors.white}${match.expectIntent}${colors.reset}`);
      }
    });
  }
}

/**
 * Display NLP intent result
 */
function displayNLPIntent(entry: LogEntry, previousMatches: Array<{ name: string; description: string; color: string; expectIntent: string | null }>): void {
  const time = formatTimestamp(entry.timestamp);
  const intent = entry.intent || entry.data?.intent?.intent;
  const confidence = entry.confidence || entry.data?.intent?.confidence;

  console.log(`\n${colors.bright}${colors.green}🧠 NLP RESULT${colors.reset} ${colors.dim}[${time}]${colors.reset}`);
  console.log(`  Intent: ${colors.bright}${colors.white}${intent}${colors.reset} (confidence: ${confidence})`);

  // Check if intent matches expected
  if (previousMatches.length > 0) {
    const expectedIntents = previousMatches.map(m => m.expectIntent).filter(Boolean);

    if (expectedIntents.length > 0) {
      const intentMatch = expectedIntents.includes(intent);

      if (intentMatch) {
        console.log(`  ${colors.bgGreen}${colors.bright} ✓ CORRECT ${colors.reset} Intent matches expected!`);
      } else {
        console.log(`  ${colors.bgRed}${colors.bright} ✗ MISMATCH ${colors.reset} Expected: ${expectedIntents.join(' or ')}, Got: ${intent}`);
      }
    }
  }

  // Show extracted data
  if (entry.data) {
    if (entry.data.intent?.reminder?.time) {
      console.log(`  ${colors.green}✓${colors.reset} Time extracted: ${colors.white}${entry.data.intent.reminder.time}${colors.reset}`);
    }
    if (entry.data.intent?.reminder?.date) {
      console.log(`  ${colors.green}✓${colors.reset} Date extracted: ${colors.white}${entry.data.intent.reminder.date}${colors.reset}`);
    }
    if (entry.data.intent?.reminder?.dateText) {
      console.log(`  ${colors.green}✓${colors.reset} DateText: ${colors.white}${entry.data.intent.reminder.dateText}${colors.reset}`);
    }
    if (entry.data.intent?.event?.dateText) {
      console.log(`  ${colors.green}✓${colors.reset} Event DateText: ${colors.white}${entry.data.intent.event.dateText}${colors.reset}`);
    }
  }
}

/**
 * Display bot response
 */
function displayBotResponse(entry: LogEntry): void {
  const time = formatTimestamp(entry.timestamp);
  const phone = entry.phone || entry.message?.match(/\d{12}/)?.[0];
  const responseText = entry.message?.replace(/📤 Sent message to \d+: "/, '').replace(/"$/, '');

  console.log(`\n${colors.bright}${colors.blue}📤 BOT RESPONSE${colors.reset} ${colors.dim}[${time}]${colors.reset}`);

  // Show first 100 chars of response
  if (responseText && responseText.length > 100) {
    console.log(`  "${responseText.substring(0, 100)}..."`);
  } else if (responseText) {
    console.log(`  "${responseText}"`);
  }
}

/**
 * Main monitor function
 */
async function monitorProductionLogs(): Promise<void> {
  console.log(`${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║     PRODUCTION MESSAGE MONITOR - REAL-TIME           ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`${colors.yellow}Monitoring production logs for user messages...${colors.reset}`);
  console.log(`${colors.dim}Press Ctrl+C to stop${colors.reset}\n`);

  console.log(`${colors.bright}Watching for:${colors.reset}`);
  watchPatterns.forEach((pattern, index) => {
    console.log(`  ${pattern.color}${index + 1}. ${pattern.name}${colors.reset} - ${colors.dim}${pattern.description}${colors.reset}`);
  });

  console.log(`\n${colors.bright}${colors.white}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}✓ Monitor started - Waiting for messages...${colors.reset}`);
  console.log(`${colors.white}═══════════════════════════════════════════════════════${colors.reset}\n`);

  let lastMatches: Array<{ name: string; description: string; color: string; expectIntent: string | null }> = [];
  let messageBuffer: string[] = [];

  // Tail production logs via SSH
  const sshCommand = 'ssh root@167.71.145.9 "cd wAssitenceBot && tail -f logs/all.log"';

  const tailProcess = exec(sshCommand);

  if (!tailProcess.stdout) {
    console.error(`${colors.red}Failed to start log monitoring${colors.reset}`);
    return;
  }

  tailProcess.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(line => line.trim());

    for (const line of lines) {
      const entry = parseLogLine(line);

      if (!entry) continue;

      // Check for incoming messages
      if (entry.message?.includes('📩 Received message from') || entry.message?.includes('Processing message from')) {
        const messageText = entry.message || entry.userMessage || '';
        const matches = checkPatterns(messageText);

        if (matches.length > 0) {
          displayUserMessage(entry, matches);
          lastMatches = matches;
        }
      }

      // Check for NLP parsing results
      if (entry.message?.includes('NLP parsed intent')) {
        if (lastMatches.length > 0) {
          displayNLPIntent(entry, lastMatches);
        }
      }

      // Check for bot responses
      if (entry.message?.includes('📤 Sent message to')) {
        if (lastMatches.length > 0) {
          displayBotResponse(entry);

          // Reset after showing complete flow
          setTimeout(() => {
            lastMatches = [];
          }, 2000);
        }
      }
    }
  });

  tailProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`${colors.red}Error:${colors.reset}`, data.toString());
  });

  tailProcess.on('close', (code) => {
    console.log(`\n${colors.yellow}Monitor stopped (exit code: ${code})${colors.reset}`);
    process.exit(code || 0);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log(`\n\n${colors.yellow}Stopping monitor...${colors.reset}`);
    tailProcess.kill();
    process.exit(0);
  });
}

// Run monitor
monitorProductionLogs().catch((error) => {
  console.error(`${colors.red}${colors.bright}Fatal Error:${colors.reset}`, error);
  process.exit(1);
});
