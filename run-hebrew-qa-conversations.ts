/**
 * 🧪 Hebrew QA Conversations - Automated Test Suite
 *
 * Comprehensive test coverage for Hebrew WhatsApp Bot
 * 46 diverse conversations covering all major use cases
 *
 * Usage: npm run test:hebrew-qa
 *
 * Generated: 2025-10-11
 * Based on: Production logs + Web research + QA best practices
 */

import { createMessageRouter } from './src/services/MessageRouter.js';
import { IMessageProvider } from './src/providers/IMessageProvider.js';
import logger from './src/utils/logger.js';
import { redis } from './src/config/redis.js';

interface TestMessage {
  from: string;
  text: string;
  expectedIntent?: string;
  expectedResponse?: string | RegExp;
  shouldContain?: string[];
  shouldNotContain?: string[];
  delay?: number;
}

interface TestConversation {
  id: string;
  category: string;
  name: string;
  description: string;
  phone: string;
  messages: TestMessage[];
  priority: 'high' | 'medium' | 'low';
}

/**
 * Mock Message Provider for Testing
 */
class TestMessageProvider implements IMessageProvider {
  private responses: Map<string, string[]> = new Map();
  private lastResponse: string = '';
  private connected: boolean = false;

  async initialize(): Promise<void> {
    this.connected = true;
  }

  async sendMessage(to: string, message: string): Promise<string> {
    if (!this.responses.has(to)) {
      this.responses.set(to, []);
    }
    this.responses.get(to)!.push(message);
    this.lastResponse = message;
    const messageId = `test_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return messageId;
  }

  async reactToMessage(to: string, messageId: string, emoji: string): Promise<void> {
    // Mock reaction
  }

  onMessage(handler: (message: any) => Promise<void>): void {}
  onConnectionStateChange(handler: (state: any) => void): void {}

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionState(): any {
    return { status: this.connected ? 'connected' : 'disconnected' };
  }

  getLastResponse(): string {
    return this.lastResponse;
  }

  getResponses(phone: string): string[] {
    return this.responses.get(phone) || [];
  }

  clearResponses(phone: string): void {
    this.responses.delete(phone);
  }
}

// ============================================================================
// 1️⃣ EVENT CREATION CONVERSATIONS (6 conversations)
// ============================================================================

const eventCreation1: TestConversation = {
  id: 'EC-1',
  category: 'Event Creation',
  name: 'Complete Event Details in One Message',
  description: 'User provides title, date, time in single message',
  phone: '+972501111001',
  priority: 'high',
  messages: [
    {
      from: '+972501111001',
      text: 'קבע פגישה עם רופא שיניים ביום שלישי בשעה 15:00',
      expectedIntent: 'create_event',
      shouldContain: ['רופא שיניים', '15:00'],
      shouldNotContain: ['באיזו שעה', 'מתי'],
    },
  ],
};

const eventCreation2: TestConversation = {
  id: 'EC-2',
  category: 'Event Creation',
  name: 'Meeting with Contact',
  description: 'Event with contact name extraction',
  phone: '+972501111002',
  priority: 'high',
  messages: [
    {
      from: '+972501111002',
      text: 'קבע פגישה עם המנכ"ל מחר בשעה 10',
      expectedIntent: 'create_event',
      shouldContain: ['מנכ"ל', '10:00', 'מחר'],
    },
  ],
};

const eventCreation3: TestConversation = {
  id: 'EC-3',
  category: 'Event Creation',
  name: 'Event with Location',
  description: 'Event including location information',
  phone: '+972501111003',
  priority: 'medium',
  messages: [
    {
      from: '+972501111003',
      text: 'קבע פגישה עם הצוות ביום רביעי ב-14:00 במשרד',
      expectedIntent: 'create_event',
      shouldContain: ['הצוות', '14:00', 'משרד'],
    },
  ],
};

const eventCreation4: TestConversation = {
  id: 'EC-4',
  category: 'Event Creation',
  name: 'Partial Information - Missing Time',
  description: 'Bot should ask for time when not provided',
  phone: '+972501111004',
  priority: 'high',
  messages: [
    {
      from: '+972501111004',
      text: 'פגישה עם דני מחר',
      expectedIntent: 'create_event',
      shouldContain: ['באיזו שעה', 'מתי'],
    },
    {
      from: '+972501111004',
      text: 'בשעה 3 אחרי הצהריים',
      shouldContain: ['15:00'],
      delay: 500,
    },
  ],
};

const eventCreation5: TestConversation = {
  id: 'EC-5',
  category: 'Event Creation',
  name: 'Casual Phrasing',
  description: 'Natural language event creation',
  phone: '+972501111005',
  priority: 'medium',
  messages: [
    {
      from: '+972501111005',
      text: 'אני צריך להגיע לרופא מחר בבוקר',
      expectedIntent: 'create_event',
      shouldContain: ['רופא', 'מחר'],
    },
    {
      from: '+972501111005',
      text: 'בערך 9',
      shouldContain: ['09:00'],
      delay: 500,
    },
  ],
};

const eventCreation6: TestConversation = {
  id: 'EC-6',
  category: 'Event Creation',
  name: 'Multiple Events Detection',
  description: 'Bot handles multiple events in one message',
  phone: '+972501111006',
  priority: 'low',
  messages: [
    {
      from: '+972501111006',
      text: 'קבע פגישה עם דני ביום ראשון בשעה 10 ועוד פגישה עם מיכל ביום שני בשעה 14',
      expectedIntent: 'create_event',
      // Bot should detect multiple events
    },
  ],
};

// ============================================================================
// 2️⃣ REMINDER CREATION CONVERSATIONS (5 conversations)
// ============================================================================

const reminderCreation1: TestConversation = {
  id: 'RC-1',
  category: 'Reminder Creation',
  name: 'Daily Recurring Reminder',
  description: 'Create a reminder that repeats every day',
  phone: '+972502222001',
  priority: 'high',
  messages: [
    {
      from: '+972502222001',
      text: 'תזכיר לי כל יום בשעה 17:00 לעדכן סטטוס',
      expectedIntent: 'create_reminder',
      shouldContain: ['17:00', 'לעדכן סטטוס', 'יום'],
    },
  ],
};

const reminderCreation2: TestConversation = {
  id: 'RC-2',
  category: 'Reminder Creation',
  name: 'Weekly Recurring Reminder',
  description: 'Create a reminder that repeats weekly on specific day',
  phone: '+972502222002',
  priority: 'high',
  messages: [
    {
      from: '+972502222002',
      text: 'תזכיר לי כל יום ראשון בשעה 8:00 לשים זבל',
      expectedIntent: 'create_reminder',
      shouldContain: ['08:00', 'לשים זבל', 'ראשון'],
    },
  ],
};

const reminderCreation3: TestConversation = {
  id: 'RC-3',
  category: 'Reminder Creation',
  name: 'One-Time Reminder',
  description: 'Create a single reminder for tomorrow',
  phone: '+972502222003',
  priority: 'medium',
  messages: [
    {
      from: '+972502222003',
      text: 'תזכיר לי מחר בשעה 12 להתקשר לאמא',
      expectedIntent: 'create_reminder',
      shouldContain: ['12:00', 'להתקשר לאמא', 'מחר'],
    },
  ],
};

const reminderCreation4: TestConversation = {
  id: 'RC-4',
  category: 'Reminder Creation',
  name: 'Reminder with "ל" Time Format',
  description: 'Parse time in "ל 15:30" format',
  phone: '+972502222004',
  priority: 'high',
  messages: [
    {
      from: '+972502222004',
      text: 'תזכיר לי מחר ל 15:30 לקנות חלב',
      expectedIntent: 'create_reminder',
      shouldContain: ['15:30', 'לקנות חלב'],
      shouldNotContain: ['איפה', 'location'],
    },
  ],
};

const reminderCreation5: TestConversation = {
  id: 'RC-5',
  category: 'Reminder Creation',
  name: 'Reminder Without Specific Time',
  description: 'Bot should ask for specific time',
  phone: '+972502222005',
  priority: 'medium',
  messages: [
    {
      from: '+972502222005',
      text: 'תזכיר לי מחר להביא מסמכים',
      expectedIntent: 'create_reminder',
      shouldContain: ['באיזו שעה'],
    },
    {
      from: '+972502222005',
      text: '8',
      shouldContain: ['08:00'],
      delay: 500,
    },
  ],
};

const reminderCreation6: TestConversation = {
  id: 'RC-6',
  category: 'Reminder Creation',
  name: 'Bug #18: List Reminders After Creation',
  description: 'Test that bot lists reminders correctly after creating one (Bug #18 fix verification)',
  phone: '+972502222006',
  priority: 'high',
  messages: [
    {
      from: '+972502222006',
      text: 'קבע תזכורת כל יום רביעי בשעה 18:00 ללכת לאימון',
      expectedIntent: 'create_reminder',
      shouldContain: ['18:00', 'ללכת לאימון', 'רביעי'],
      delay: 500,
    },
    {
      from: '+972502222006',
      text: 'תראה את כל התזכורות שיש לי?',
      expectedIntent: 'list_reminders',
      shouldContain: ['תזכורות', '18:00', 'ללכת לאימון'],
      shouldNotContain: ['לא נמצאו תזכורות עבור', 'תזכורות', 'אין לך תזכורות'],
      delay: 500,
    },
  ],
};

const reminderCreation7: TestConversation = {
  id: 'RC-7',
  category: 'Reminder Creation',
  name: 'Bug #4: Reminder One Day Before Event',
  description: 'Test that bot understands "יום לפני" (one day before) for offset-based reminders (Bug #4 fix verification)',
  phone: '+972502222007',
  priority: 'high',
  messages: [
    {
      from: '+972502222007',
      text: 'קבע אירוע הובלה מחר בשעה 14:00',
      expectedIntent: 'create_event',
      shouldContain: ['הובלה', '14:00'],
      delay: 500,
    },
    {
      from: '+972502222007',
      text: 'תזכיר לי יום לפני ההובלה',
      expectedIntent: 'add_comment',
      shouldContain: ['תזכורת', 'הובלה'],
      shouldNotContain: ['לא הבנתי', 'לא מזהה', 'נסה שוב'],
      delay: 500,
    },
  ],
};

// ============================================================================
// 3️⃣ EVENT QUERY CONVERSATIONS (8 conversations)
// ============================================================================

const eventQuery1: TestConversation = {
  id: 'EQ-1',
  category: 'Event Queries',
  name: 'What\'s This Week?',
  description: 'Query all events for current week',
  phone: '+972503333001',
  priority: 'high',
  messages: [
    {
      from: '+972503333001',
      text: 'מה יש לי השבוע?',
      expectedIntent: 'list_events',
      shouldContain: ['אירועים', 'שבוע'],
    },
  ],
};

const eventQuery2: TestConversation = {
  id: 'EQ-2',
  category: 'Event Queries',
  name: 'What\'s Tomorrow?',
  description: 'Query events for tomorrow',
  phone: '+972503333002',
  priority: 'high',
  messages: [
    {
      from: '+972503333002',
      text: 'מה יש לי מחר',
      expectedIntent: 'list_events',
      shouldContain: ['מחר'],
    },
  ],
};

const eventQuery3: TestConversation = {
  id: 'EQ-3',
  category: 'Event Queries',
  name: 'What\'s Today?',
  description: 'Query events for today',
  phone: '+972503333003',
  priority: 'medium',
  messages: [
    {
      from: '+972503333003',
      text: 'מה יש לי היום?',
      expectedIntent: 'list_events',
      shouldContain: ['היום'],
    },
  ],
};

const eventQuery4: TestConversation = {
  id: 'EQ-4',
  category: 'Event Queries',
  name: 'Show Everything',
  description: 'Query all upcoming events',
  phone: '+972503333004',
  priority: 'medium',
  messages: [
    {
      from: '+972503333004',
      text: 'רוצה לראות הכל',
      expectedIntent: 'list_events',
    },
  ],
};

const eventQuery5: TestConversation = {
  id: 'EQ-5',
  category: 'Event Queries',
  name: 'Search by Name',
  description: 'Search for events containing specific name',
  phone: '+972503333005',
  priority: 'high',
  messages: [
    {
      from: '+972503333005',
      text: 'קבע פגישה עם דני מחר בשעה 10',
      delay: 500,
    },
    {
      from: '+972503333005',
      text: 'מה יש לי עם דני?',
      expectedIntent: 'search_event',
      shouldContain: ['דני'],
      delay: 1000,
    },
  ],
};

const eventQuery6: TestConversation = {
  id: 'EQ-6',
  category: 'Event Queries',
  name: 'Search by Day of Week',
  description: 'Search for all events on Sundays',
  phone: '+972503333006',
  priority: 'medium',
  messages: [
    {
      from: '+972503333006',
      text: 'מה יש לי ימי ראשון?',
      expectedIntent: 'list_events',
      shouldContain: ['ראשון'],
    },
  ],
};

const eventQuery7: TestConversation = {
  id: 'EQ-7',
  category: 'Event Queries',
  name: '"When is..." Question',
  description: 'Critical: Should search, not create event',
  phone: '+972503333007',
  priority: 'high',
  messages: [
    {
      from: '+972503333007',
      text: 'מתי הפגישה עם המנכ"ל?',
      expectedIntent: 'search_event',
      shouldNotContain: ['לא הצלחתי להבין את התאריך', 'date parsing error'],
    },
  ],
};

const eventQuery8: TestConversation = {
  id: 'EQ-8',
  category: 'Event Queries',
  name: 'Check if Event Exists',
  description: 'Yes/No query for specific timeframe',
  phone: '+972503333008',
  priority: 'low',
  messages: [
    {
      from: '+972503333008',
      text: 'יש לי משהו מחר בבוקר?',
      expectedIntent: 'list_events',
    },
  ],
};

// ============================================================================
// 4️⃣ EVENT UPDATE CONVERSATIONS (4 conversations)
// ============================================================================

const eventUpdate1: TestConversation = {
  id: 'EU-1',
  category: 'Event Updates',
  name: 'Change Event Time',
  description: 'Update time of existing event',
  phone: '+972504444001',
  priority: 'high',
  messages: [
    {
      from: '+972504444001',
      text: 'קבע פגישה עם דני מחר בשעה 10',
      delay: 500,
    },
    {
      from: '+972504444001',
      text: 'עדכן את הפגישה עם דני לשעה 16:00',
      expectedIntent: 'update_event',
      shouldContain: ['16:00', 'דני'],
      delay: 1000,
    },
  ],
};

const eventUpdate2: TestConversation = {
  id: 'EU-2',
  category: 'Event Updates',
  name: 'Change Event Date',
  description: 'Update date of existing event',
  phone: '+972504444002',
  priority: 'high',
  messages: [
    {
      from: '+972504444002',
      text: 'קבע פגישה עם רופא שיניים מחר בשעה 15:00',
      delay: 500,
    },
    {
      from: '+972504444002',
      text: 'שנה את הפגישה עם רופא שיניים ליום חמישי',
      expectedIntent: 'update_event',
      shouldContain: ['חמישי', 'רופא שיניים'],
      delay: 1000,
    },
  ],
};

const eventUpdate3: TestConversation = {
  id: 'EU-3',
  category: 'Event Updates',
  name: 'Change Event Location',
  description: 'Update location of existing event',
  phone: '+972504444003',
  priority: 'medium',
  messages: [
    {
      from: '+972504444003',
      text: 'קבע פגישה עם הצוות מחר בשעה 14:00 במשרד',
      delay: 500,
    },
    {
      from: '+972504444003',
      text: 'הפגישה עם הצוות תהיה בזום ולא במשרד',
      expectedIntent: 'update_event',
      shouldContain: ['זום', 'הצוות'],
      delay: 1000,
    },
  ],
};

const eventUpdate4: TestConversation = {
  id: 'EU-4',
  category: 'Event Updates',
  name: 'Postpone Event',
  description: 'Move event to different day',
  phone: '+972504444004',
  priority: 'medium',
  messages: [
    {
      from: '+972504444004',
      text: 'קבע פגישה מחר בשעה 10',
      delay: 500,
    },
    {
      from: '+972504444004',
      text: 'תדחה את הפגישה מחר ב-10 ליום אחרי',
      expectedIntent: 'update_event',
      delay: 1000,
    },
  ],
};

// ============================================================================
// 5️⃣ EVENT DELETION CONVERSATIONS (4 conversations)
// ============================================================================

const eventDeletion1: TestConversation = {
  id: 'ED-1',
  category: 'Event Deletion',
  name: 'Delete by Name',
  description: 'Delete event by searching for name',
  phone: '+972505555001',
  priority: 'high',
  messages: [
    {
      from: '+972505555001',
      text: 'קבע פגישה עם רופא שיניים מחר בשעה 15:00',
      delay: 500,
    },
    {
      from: '+972505555001',
      text: 'תבטל את הפגישה עם רופא שיניים',
      expectedIntent: 'delete_event',
      shouldContain: ['רופא שיניים', 'מחק'],
      delay: 1000,
    },
    {
      from: '+972505555001',
      text: 'כן',
      shouldContain: ['נמחק', 'בוטל'],
      delay: 500,
    },
  ],
};

const eventDeletion2: TestConversation = {
  id: 'ED-2',
  category: 'Event Deletion',
  name: 'Delete with Fuzzy Match',
  description: 'Critical: Fuzzy matching should find partial names',
  phone: '+972505555002',
  priority: 'high',
  messages: [
    {
      from: '+972505555002',
      text: 'קבע בדיקת דם עם ריאל מחר בשעה 8:00',
      delay: 500,
    },
    {
      from: '+972505555002',
      text: 'תבטל בדיקת דם',
      expectedIntent: 'delete_event',
      shouldContain: ['בדיקת דם'],
      shouldNotContain: ['לא נמצא'],
      delay: 1000,
    },
    {
      from: '+972505555002',
      text: 'כן',
      delay: 500,
    },
  ],
};

const eventDeletion3: TestConversation = {
  id: 'ED-3',
  category: 'Event Deletion',
  name: 'Delete Tomorrow\'s Event',
  description: 'Delete event by date',
  phone: '+972505555003',
  priority: 'medium',
  messages: [
    {
      from: '+972505555003',
      text: 'קבע פגישה מחר בשעה 10',
      delay: 500,
    },
    {
      from: '+972505555003',
      text: 'בטל את הפגישה מחר',
      expectedIntent: 'delete_event',
      shouldContain: ['מחר'],
      delay: 1000,
    },
  ],
};

const eventDeletion4: TestConversation = {
  id: 'ED-4',
  category: 'Event Deletion',
  name: 'Cancel Deletion',
  description: 'User cancels deletion request',
  phone: '+972505555004',
  priority: 'low',
  messages: [
    {
      from: '+972505555004',
      text: 'קבע פגישה עם המנכ"ל מחר בשעה 10',
      delay: 500,
    },
    {
      from: '+972505555004',
      text: 'מחק את הפגישה עם המנכ"ל',
      expectedIntent: 'delete_event',
      delay: 1000,
    },
    {
      from: '+972505555004',
      text: 'לא, טעות',
      shouldContain: ['בוטל', 'cancel'],
      delay: 500,
    },
  ],
};

// ============================================================================
// 6️⃣ GENERAL HELP CONVERSATIONS (5 conversations)
// ============================================================================

const generalHelp1: TestConversation = {
  id: 'GH-1',
  category: 'General Help',
  name: 'First Time User',
  description: 'New user doesn\'t understand how bot works',
  phone: '+972506666001',
  priority: 'high',
  messages: [
    {
      from: '+972506666001',
      text: 'היי',
    },
    {
      from: '+972506666001',
      text: 'אני לא מבינה איך זה עובד',
      expectedIntent: 'help',
      shouldContain: ['עזרה', 'help', 'דרך'],
      delay: 500,
    },
  ],
};

const generalHelp2: TestConversation = {
  id: 'GH-2',
  category: 'General Help',
  name: 'Menu Request',
  description: 'User requests main menu',
  phone: '+972506666002',
  priority: 'high',
  messages: [
    {
      from: '+972506666002',
      text: '/תפריט',
      shouldContain: ['תפריט', 'menu'],
    },
  ],
};

const generalHelp3: TestConversation = {
  id: 'GH-3',
  category: 'General Help',
  name: 'Help Command',
  description: 'User requests help explicitly',
  phone: '+972506666003',
  priority: 'medium',
  messages: [
    {
      from: '+972506666003',
      text: '/עזרה',
      expectedIntent: 'help',
      shouldContain: ['עזרה', 'help'],
    },
  ],
};

const generalHelp4: TestConversation = {
  id: 'GH-4',
  category: 'General Help',
  name: 'What Can You Do?',
  description: 'User asks about bot capabilities',
  phone: '+972506666004',
  priority: 'medium',
  messages: [
    {
      from: '+972506666004',
      text: 'מה אתה יכול לעשות?',
      expectedIntent: 'help',
    },
  ],
};

const generalHelp5: TestConversation = {
  id: 'GH-5',
  category: 'General Help',
  name: 'Confused User',
  description: 'User says they don\'t understand',
  phone: '+972506666005',
  priority: 'low',
  messages: [
    {
      from: '+972506666005',
      text: 'לא הבנתי',
      expectedIntent: 'help',
    },
  ],
};

// ============================================================================
// 7️⃣ EDGE CASES & TYPOS (8 conversations)
// ============================================================================

const edgeCase1: TestConversation = {
  id: 'EDGE-1',
  category: 'Edge Cases',
  name: 'Typos in Event Creation',
  description: 'Bot should handle common typos gracefully',
  phone: '+972507777001',
  priority: 'high',
  messages: [
    {
      from: '+972507777001',
      text: 'קבעפגושה מצר בשעה 2',
      // Should attempt to parse despite typos
    },
  ],
};

const edgeCase2: TestConversation = {
  id: 'EDGE-2',
  category: 'Edge Cases',
  name: 'Missing Spaces',
  description: 'Handle concatenated words',
  phone: '+972507777002',
  priority: 'medium',
  messages: [
    {
      from: '+972507777002',
      text: 'רוצלראות מהיש למחר',
      // Should handle missing spaces
    },
  ],
};

const edgeCase3: TestConversation = {
  id: 'EDGE-3',
  category: 'Edge Cases',
  name: 'Time Format Variations',
  description: 'Parse different time formats correctly',
  phone: '+972507777003',
  priority: 'high',
  messages: [
    {
      from: '+972507777003',
      text: 'פגישה מחר ב 3 אחרי הצהריים',
      shouldContain: ['15:00'],
    },
    {
      from: '+972507777003',
      text: 'פגישה ביום שני בשעה שמונה בערב',
      shouldContain: ['20:00'],
      delay: 1000,
    },
  ],
};

const edgeCase4: TestConversation = {
  id: 'EDGE-4',
  category: 'Edge Cases',
  name: 'Date Format Variations',
  description: 'Parse different date formats',
  phone: '+972507777004',
  priority: 'medium',
  messages: [
    {
      from: '+972507777004',
      text: 'פגישה ב-15/10 בשעה 10',
      shouldContain: ['15/10'],
    },
  ],
};

const edgeCase5: TestConversation = {
  id: 'EDGE-5',
  category: 'Edge Cases',
  name: 'Ambiguous Time',
  description: 'Handle 12:00 ambiguity (AM/PM)',
  phone: '+972507777005',
  priority: 'low',
  messages: [
    {
      from: '+972507777005',
      text: 'פגישה מחר ב-12',
      // Should clarify or default to noon
    },
  ],
};

const edgeCase6: TestConversation = {
  id: 'EDGE-6',
  category: 'Edge Cases',
  name: 'Past Date Attempt',
  description: 'Should reject past dates',
  phone: '+972507777006',
  priority: 'high',
  messages: [
    {
      from: '+972507777006',
      text: 'קבע פגישה אתמול בשעה 10',
      shouldContain: ['עבר', 'past', 'לא ניתן'],
    },
  ],
};

const edgeCase7: TestConversation = {
  id: 'EDGE-7',
  category: 'Edge Cases',
  name: 'Invalid Date',
  description: 'Handle impossible dates gracefully',
  phone: '+972507777007',
  priority: 'medium',
  messages: [
    {
      from: '+972507777007',
      text: 'קבע פגישה ב-32 לינואר',
      shouldContain: ['שגיאה', 'error', 'לא תקין'],
    },
  ],
};

const edgeCase8: TestConversation = {
  id: 'EDGE-8',
  category: 'Edge Cases',
  name: 'Very Long Event Name',
  description: 'Handle extremely long event titles',
  phone: '+972507777008',
  priority: 'low',
  messages: [
    {
      from: '+972507777008',
      text: 'קבע פגישה עם הצוות שלי בנושא תכנון האסטרטגיה השנתית לשנת 2026 וסיכום התוצאות של שנת 2025 ביום רביעי בשעה 14:00',
      expectedIntent: 'create_event',
    },
  ],
};

// ============================================================================
// 8️⃣ COMPLEX FLOWS (6 conversations)
// ============================================================================

const complexFlow1: TestConversation = {
  id: 'CF-1',
  category: 'Complex Flows',
  name: 'Multi-Step Event Creation',
  description: 'Create event through menu system',
  phone: '+972508888001',
  priority: 'medium',
  messages: [
    {
      from: '+972508888001',
      text: '/תפריט',
    },
    {
      from: '+972508888001',
      text: '1',
      delay: 500,
    },
    {
      from: '+972508888001',
      text: 'פגישה עם דני',
      delay: 500,
    },
    {
      from: '+972508888001',
      text: 'מחר',
      delay: 500,
    },
    {
      from: '+972508888001',
      text: '14:00',
      shouldContain: ['פגישה עם דני', '14:00'],
      delay: 500,
    },
  ],
};

const complexFlow2: TestConversation = {
  id: 'CF-2',
  category: 'Complex Flows',
  name: 'Create-Query-Delete Flow',
  description: 'Full lifecycle of an event',
  phone: '+972508888002',
  priority: 'high',
  messages: [
    {
      from: '+972508888002',
      text: 'קבע פגישה עם אסף ביום שלישי בשעה 11',
      delay: 500,
    },
    {
      from: '+972508888002',
      text: 'מה יש לי ביום שלישי?',
      shouldContain: ['אסף'],
      delay: 1000,
    },
    {
      from: '+972508888002',
      text: 'תבטל את הפגישה עם אסף',
      delay: 1000,
    },
    {
      from: '+972508888002',
      text: 'כן',
      shouldContain: ['נמחק', 'בוטל'],
      delay: 500,
    },
  ],
};

const complexFlow3: TestConversation = {
  id: 'CF-3',
  category: 'Complex Flows',
  name: 'Update Existing Event',
  description: 'Create then update event',
  phone: '+972508888003',
  priority: 'medium',
  messages: [
    {
      from: '+972508888003',
      text: 'קבע פגישה עם לקוח מחר בשעה 10',
      delay: 500,
    },
    {
      from: '+972508888003',
      text: 'שנה את השעה ל-11',
      shouldContain: ['11:00'],
      delay: 1000,
    },
  ],
};

const complexFlow4: TestConversation = {
  id: 'CF-4',
  category: 'Complex Flows',
  name: 'Multiple Operations',
  description: 'Create multiple events and reminders',
  phone: '+972508888004',
  priority: 'low',
  messages: [
    {
      from: '+972508888004',
      text: 'קבע פגישה מחר בשעה 10',
      delay: 500,
    },
    {
      from: '+972508888004',
      text: 'קבע עוד פגישה ביום שלישי בשעה 14',
      delay: 1000,
    },
    {
      from: '+972508888004',
      text: 'תזכיר לי כל יום ראשון בשעה 8 לשים זבל',
      delay: 1000,
    },
  ],
};

const complexFlow5: TestConversation = {
  id: 'CF-5',
  category: 'Complex Flows',
  name: 'Correction During Creation',
  description: 'User corrects details mid-flow',
  phone: '+972508888005',
  priority: 'medium',
  messages: [
    {
      from: '+972508888005',
      text: 'קבע פגישה עם דני ביום רביעי בשעה 10',
      delay: 500,
    },
    {
      from: '+972508888005',
      text: 'לא חכה, ביום חמישי',
      shouldContain: ['חמישי'],
      delay: 500,
    },
  ],
};

const complexFlow6: TestConversation = {
  id: 'CF-6',
  category: 'Complex Flows',
  name: 'Context Switching',
  description: 'Switch between different operations',
  phone: '+972508888006',
  priority: 'low',
  messages: [
    {
      from: '+972508888006',
      text: 'מה יש לי השבוע?',
      delay: 500,
    },
    {
      from: '+972508888006',
      text: 'קבע עוד פגישה ביום רביעי בשעה 15',
      delay: 1000,
    },
    {
      from: '+972508888006',
      text: 'מה עכשיו יש לי ביום רביעי?',
      shouldContain: ['רביעי', '15'],
      delay: 1000,
    },
  ],
};

// ============================================================================
// TEST SUITE CONFIGURATION
// ============================================================================

const ALL_CONVERSATIONS: TestConversation[] = [
  // Event Creation (6)
  eventCreation1, eventCreation2, eventCreation3, eventCreation4, eventCreation5, eventCreation6,

  // Reminder Creation (7)
  reminderCreation1, reminderCreation2, reminderCreation3, reminderCreation4, reminderCreation5, reminderCreation6, reminderCreation7,

  // Event Queries (8)
  eventQuery1, eventQuery2, eventQuery3, eventQuery4, eventQuery5, eventQuery6, eventQuery7, eventQuery8,

  // Event Updates (4)
  eventUpdate1, eventUpdate2, eventUpdate3, eventUpdate4,

  // Event Deletion (4)
  eventDeletion1, eventDeletion2, eventDeletion3, eventDeletion4,

  // General Help (5)
  generalHelp1, generalHelp2, generalHelp3, generalHelp4, generalHelp5,

  // Edge Cases (8)
  edgeCase1, edgeCase2, edgeCase3, edgeCase4, edgeCase5, edgeCase6, edgeCase7, edgeCase8,

  // Complex Flows (6)
  complexFlow1, complexFlow2, complexFlow3, complexFlow4, complexFlow5, complexFlow6,
];

// ============================================================================
// TEST RUNNER
// ============================================================================

class HebrewQATestRunner {
  private testsPassed = 0;
  private testsFailed = 0;
  private testsSkipped = 0;
  private testResults: Array<{
    conversationId: string;
    conversationName: string;
    messageNum: number;
    status: 'PASS' | 'FAIL' | 'SKIP';
    expected?: string;
    received?: string;
    error?: string;
  }> = [];

  private messageProvider: TestMessageProvider;
  private messageRouter: any;
  private authService: any;
  private stateManager: any;
  private pool: any;

  async initialize() {
    this.messageProvider = new TestMessageProvider();
    this.messageRouter = createMessageRouter(this.messageProvider);

    const { default: authService } = await import('./src/services/AuthService.js');
    const { default: stateManager } = await import('./src/services/StateManager.js');
    const { pool } = await import('./src/config/database.js');

    this.authService = authService;
    this.stateManager = stateManager;
    this.pool = pool;

    logger.info('✅ Hebrew QA Test Runner initialized');
  }

  /**
   * Run all conversations
   */
  async runAll(filter?: {
    category?: string;
    priority?: 'high' | 'medium' | 'low';
    ids?: string[];
  }): Promise<void> {
    logger.info('🧪 Starting Hebrew QA Test Suite');
    logger.info('═'.repeat(80));
    logger.info(`📊 Total Conversations: ${ALL_CONVERSATIONS.length}`);
    logger.info('');

    let conversationsToRun = ALL_CONVERSATIONS;

    // Apply filters
    if (filter?.category) {
      conversationsToRun = conversationsToRun.filter(c => c.category === filter.category);
      logger.info(`🔍 Filter: Category = ${filter.category}`);
    }
    if (filter?.priority) {
      conversationsToRun = conversationsToRun.filter(c => c.priority === filter.priority);
      logger.info(`🔍 Filter: Priority = ${filter.priority}`);
    }
    if (filter?.ids && filter.ids.length > 0) {
      conversationsToRun = conversationsToRun.filter(c => filter.ids!.includes(c.id));
      logger.info(`🔍 Filter: IDs = ${filter.ids.join(', ')}`);
    }

    logger.info(`🎯 Running ${conversationsToRun.length} conversations\n`);
    logger.info('═'.repeat(80));

    for (const conversation of conversationsToRun) {
      await this.runConversation(conversation);
      await this.sleep(3000); // 3s delay between conversations
    }

    this.printResults();
  }

  /**
   * Run a single conversation
   */
  async runConversation(conversation: TestConversation): Promise<void> {
    logger.info(`\n${'─'.repeat(80)}`);
    logger.info(`📋 [${conversation.id}] ${conversation.name}`);
    logger.info(`📁 Category: ${conversation.category} | 🎯 Priority: ${conversation.priority}`);
    logger.info(`👤 ${conversation.description}`);
    logger.info(`📱 Phone: ${conversation.phone}`);
    logger.info('─'.repeat(80));

    try {
      // Setup clean test user
      await this.cleanupUser(conversation.phone);

      let messageCount = 0;
      for (const message of conversation.messages) {
        messageCount++;
        await this.sendAndVerify(conversation, messageCount, message);

        if (message.delay) {
          await this.sleep(message.delay);
        } else {
          await this.sleep(800); // Default delay
        }
      }

      logger.info(`✅ Conversation ${conversation.id} completed`);
    } catch (error: any) {
      logger.error(`❌ Conversation ${conversation.id} failed:`, error.message);
    }
  }

  /**
   * Send message and verify
   */
  private async sendAndVerify(
    conversation: TestConversation,
    messageNum: number,
    message: TestMessage
  ): Promise<void> {
    try {
      logger.info(`\n  💬 Msg ${messageNum}: "${message.text}"`);

      const response = await this.simulateMessage(message.text, message.from);

      let passed = true;
      const failures: string[] = [];

      // Check shouldContain
      if (message.shouldContain) {
        for (const keyword of message.shouldContain) {
          if (!response.includes(keyword)) {
            passed = false;
            failures.push(`Missing keyword: "${keyword}"`);
          }
        }
      }

      // Check shouldNotContain
      if (message.shouldNotContain) {
        for (const keyword of message.shouldNotContain) {
          if (response.includes(keyword)) {
            passed = false;
            failures.push(`Should not contain: "${keyword}"`);
          }
        }
      }

      // Check regex pattern
      if (message.expectedResponse) {
        const matched = this.matchesExpected(response, message.expectedResponse);
        if (!matched) {
          passed = false;
          failures.push(`Response pattern mismatch`);
        }
      }

      if (passed) {
        logger.info(`  ✅ PASS`);
        this.testsPassed++;
        this.testResults.push({
          conversationId: conversation.id,
          conversationName: conversation.name,
          messageNum,
          status: 'PASS',
        });
      } else {
        logger.error(`  ❌ FAIL: ${failures.join(', ')}`);
        logger.error(`     Response: ${response.substring(0, 100)}...`);
        this.testsFailed++;
        this.testResults.push({
          conversationId: conversation.id,
          conversationName: conversation.name,
          messageNum,
          status: 'FAIL',
          expected: failures.join(', '),
          received: response,
        });
      }
    } catch (error: any) {
      logger.error(`  ❌ ERROR: ${error.message}`);
      this.testsFailed++;
      this.testResults.push({
        conversationId: conversation.id,
        conversationName: conversation.name,
        messageNum,
        status: 'FAIL',
        error: error.message,
      });
    }
  }

  private async simulateMessage(text: string, from: string): Promise<string> {
    this.messageProvider.clearResponses(from);
    const messageId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.messageRouter.routeMessage(from, text, messageId);
    await this.sleep(300);
    const responses = this.messageProvider.getResponses(from);
    return responses.length > 0 ? responses[responses.length - 1] : '[No response]';
  }

  private matchesExpected(response: string, expected: string | RegExp): boolean {
    if (typeof expected === 'string') {
      return response.includes(expected);
    } else {
      return expected.test(response);
    }
  }

  private async cleanupUser(phone: string): Promise<void> {
    try {
      const cleanPhone = phone.replace(/\+/g, '');
      const keys = await redis.keys(`*${cleanPhone}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      let user = await this.authService.getUserByPhone(phone);
      if (user) {
        await this.pool.query('DELETE FROM users WHERE phone = $1', [phone]);
        await this.pool.query('DELETE FROM events WHERE user_id = $1', [user.id]);
        await this.pool.query('DELETE FROM reminders WHERE user_id = $1', [user.id]);
      }

      const testName = `QA_${cleanPhone.slice(-4)}`;
      user = await this.authService.registerUser(phone, testName, '1234');
      await this.authService.loginUser(phone, '1234');

      await redis.setex(`auth:state:${phone}`, 172800, JSON.stringify({
        authenticated: true,
        userId: user.id,
        phone: phone,
        failedAttempts: 0,
        lockoutUntil: null
      }));

      await this.stateManager.setState(user.id, 'MAIN_MENU' as any, {});
    } catch (error: any) {
      logger.error(`Error setting up test user ${phone}:`, error.message);
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private printResults(): void {
    logger.info('\n\n');
    logger.info('═'.repeat(80));
    logger.info('📊 HEBREW QA TEST RESULTS');
    logger.info('═'.repeat(80));

    const total = this.testsPassed + this.testsFailed + this.testsSkipped;
    const passRate = total > 0 ? ((this.testsPassed / total) * 100).toFixed(2) : '0.00';

    logger.info(`\n✅ Passed: ${this.testsPassed}`);
    logger.info(`❌ Failed: ${this.testsFailed}`);
    logger.info(`⏭️  Skipped: ${this.testsSkipped}`);
    logger.info(`📝 Total: ${total}`);
    logger.info(`📈 Pass Rate: ${passRate}%\n`);

    // Category breakdown
    const categories = new Map<string, { passed: number; failed: number }>();
    ALL_CONVERSATIONS.forEach(conv => {
      if (!categories.has(conv.category)) {
        categories.set(conv.category, { passed: 0, failed: 0 });
      }
    });

    this.testResults.forEach(result => {
      const conv = ALL_CONVERSATIONS.find(c => c.id === result.conversationId);
      if (conv) {
        const cat = categories.get(conv.category)!;
        if (result.status === 'PASS') {
          cat.passed++;
        } else {
          cat.failed++;
        }
      }
    });

    logger.info('📊 Category Breakdown:');
    logger.info('─'.repeat(80));
    categories.forEach((stats, category) => {
      const catTotal = stats.passed + stats.failed;
      const catRate = catTotal > 0 ? ((stats.passed / catTotal) * 100).toFixed(1) : '0.0';
      logger.info(`  ${category}: ${stats.passed}/${catTotal} (${catRate}%)`);
    });

    if (this.testsFailed > 0) {
      logger.info('\n❌ Failed Tests:');
      logger.info('─'.repeat(80));
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(result => {
          logger.error(`\n  [${result.conversationId}] ${result.conversationName} - Msg ${result.messageNum}`);
          if (result.expected) logger.error(`    Expected: ${result.expected}`);
          if (result.received) logger.error(`    Received: ${result.received.substring(0, 150)}...`);
          if (result.error) logger.error(`    Error: ${result.error}`);
        });
    }

    logger.info('\n' + '═'.repeat(80));
    logger.info(`🏁 Test Suite Completed - ${passRate}% Pass Rate`);
    logger.info('═'.repeat(80) + '\n');
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    logger.info('🚀 Initializing Hebrew QA Test Runner...');
    const runner = new HebrewQATestRunner();
    await runner.initialize();

    // Parse command-line arguments
    const args = process.argv.slice(2);
    const filter: any = {};

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--category' && args[i + 1]) {
        filter.category = args[i + 1];
        i++;
      } else if (args[i] === '--priority' && args[i + 1]) {
        filter.priority = args[i + 1];
        i++;
      } else if (args[i] === '--ids' && args[i + 1]) {
        filter.ids = args[i + 1].split(',');
        i++;
      }
    }

    await runner.runAll(filter);

    await redis.quit();
    process.exit(0);
  } catch (error: any) {
    logger.error('❌ Fatal error:', error);
    try {
      await redis.quit();
    } catch {}
    process.exit(1);
  }
}

main();

export { HebrewQATestRunner, ALL_CONVERSATIONS };
