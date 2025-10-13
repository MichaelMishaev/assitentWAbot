import OpenAI from 'openai';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';

interface Contact {
  id: string;
  userId: string;
  name: string;
  relation?: string | null;
  aliases: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface NLPIntent {
  intent: 'create_event' | 'create_reminder' | 'search_event' | 'list_events' | 'list_reminders' | 'delete_event' | 'delete_reminder' | 'update_event' | 'update_reminder' | 'complete_task' | 'send_message' | 'add_contact' | 'add_comment' | 'view_comments' | 'delete_comment' | 'update_comment' | 'generate_dashboard' | 'unknown';
  confidence: number;
  urgency?: 'urgent' | 'important' | 'normal'; // NEW: Emotional context
  event?: {
    title: string;
    date?: string; // ISO 8601 datetime
    dateText?: string; // Hebrew date text for parsing (e.g., "השבוע", "ימי ראשון")
    endDate?: string; // ISO 8601 datetime for multi-day events
    location?: string;
    contactName?: string;
    notes?: string;
    deleteAll?: boolean; // For bulk delete operations
  };
  reminder?: {
    title: string;
    dueDate?: string; // ISO 8601 datetime
    date?: string; // ISO 8601 datetime (alias for dueDate)
    dateText?: string; // Hebrew date text for parsing
    time?: string; // Time string HH:MM for updates
    recurrence?: string; // RRULE format
  };
  message?: {
    recipient: string;
    content: string;
  };
  contact?: {
    name: string;
    phone: string;
    relation?: string;
  };
  comment?: {
    eventTitle: string; // Which event to add/view/delete/update comment from
    text?: string; // Comment text (for add_comment/update_comment)
    priority?: 'normal' | 'high' | 'urgent'; // Comment priority
    reminderTime?: string; // ISO 8601 datetime if user wants reminder from comment
    reminderOffset?: number; // Offset in minutes BEFORE event (e.g., -60 for 1 hour before)
    commentIndex?: number; // Comment number to update (for update_comment, 1-based)
    deleteBy?: 'index' | 'last' | 'text'; // How to identify comment to delete
    deleteValue?: string | number; // Index number or text to search
  };
  clarificationNeeded?: string;
}

export class NLPService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  /**
   * Parse user message using OpenAI to extract intent and entities
   */
  async parseIntent(
    userMessage: string,
    userContacts: Contact[],
    userTimezone: string = 'Asia/Jerusalem',
    conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
  ): Promise<NLPIntent> {
    try {
      // CRITICAL FIX: Use current time IN USER'S TIMEZONE, not UTC
      // This prevents timezone confusion where OpenAI thinks 11:00 UTC is current time
      // but user is in Asia/Jerusalem (14:00 local)
      const currentDate = DateTime.now().setZone(userTimezone).toISO();

      const contactNames = userContacts.map(c => ({
        name: c.name,
        relation: c.relation,
        aliases: c.aliases
      }));

      const systemPrompt = `You are a Hebrew/English calendar assistant for a WhatsApp bot. Extract user intent from messages.

CRITICAL TIMEZONE INSTRUCTION:
- Current date/time in user's timezone (${userTimezone}): ${currentDate}
- This timestamp ALREADY includes the correct timezone offset
- When calculating times, use THIS as your reference point
- Return ALL dates in ISO 8601 format WITH timezone (e.g., "2025-11-11T14:00:00+02:00" for Israel winter time)
- NEVER convert to UTC or remove timezone information

User contacts: ${JSON.stringify(contactNames, null, 2)}

Parse the message and return JSON with this structure:
{
  "intent": "create_event|create_reminder|search_event|list_events|list_reminders|delete_event|delete_reminder|update_event|update_reminder|complete_task|send_message|add_contact|add_comment|view_comments|delete_comment|update_comment|generate_dashboard|unknown",
  "confidence": 0.0-1.0,
  "urgency": "urgent|important|normal (optional)",
  "event": {
    "title": "string",
    "date": "ISO 8601 datetime in ${userTimezone} OR Hebrew date text (e.g., 'מחר', 'שבוע הבא')",
    "dateText": "ORIGINAL Hebrew/English date text from user query (e.g., 'שבוע הקרוב', 'next week')",
    "endDate": "ISO 8601 datetime (optional, for multi-day events)",
    "location": "string (optional)",
    "contactName": "contact name if mentioned",
    "notes": "additional notes (optional)",
    "deleteAll": "true if user wants to delete ALL events (e.g., 'מחק הכל', 'תבטל את כל האירועים')"
  },
  "reminder": {
    "title": "string",
    "dueDate": "ISO 8601 datetime in ${userTimezone} (for create/update)",
    "date": "ISO 8601 datetime (alias for dueDate, use for updates)",
    "dateText": "Hebrew date text (optional, e.g., 'מחר', 'יום ראשון')",
    "time": "Time string HH:MM (optional, for update_reminder without full date)",
    "recurrence": "RRULE format (optional)"
  },
  "message": {
    "recipient": "contact name",
    "content": "message text"
  },
  "contact": {
    "name": "contact name",
    "phone": "phone number (with country code if provided)",
    "relation": "relationship (optional, e.g., אמא, אבא, חבר)"
  },
  "comment": {
    "eventTitle": "event name/title",
    "text": "comment text (for add_comment/update_comment)",
    "priority": "normal|high|urgent (optional, default: normal)",
    "reminderTime": "ISO 8601 datetime if user wants reminder (optional)",
    "reminderOffset": "offset in minutes BEFORE event (optional, e.g., -60 for 1 hour before)",
    "commentIndex": "comment number to update (for update_comment, 1-based)",
    "deleteBy": "index|last|text (for delete_comment)",
    "deleteValue": "index number or text to search (for delete_comment)"
  },
  "clarificationNeeded": "string - ask user for missing info (optional)"
}

Intent Detection Rules:
CREATE:
- "קבע", "תקבע", "צור", "הוסף", "schedule", "create", "add", "new" → create_event/create_reminder
- Event keywords: "פגישה", "אירוע", "meeting", "event", "appointment"
- Reminder keywords: "תזכיר", "תזכורת", "remind", "reminder", "אל תשכח", "don't forget"

SEARCH/LIST (ALL VARIATIONS):
EVENTS:
- "מה יש לי", "מה יש", "יש לי", "שיש לי", "האירועים שלי", "האירועים שיש", "האירועים שיש לי"
- "מה יש אצלי", "מה יש בלוז", "מה בתכנית" (what's in my schedule/plan)
- "הראה", "תראה", "הצג", "תציג", "תן לי", "give me", "show me"
- "רשימה", "רשימת", "list", "display"
- "מה הקרוב", "מה הבא", "הבא בתור", "הקרוב שלי", "מה הכי קרוב"
- "כמה אירועים", "כמה פגישות", "how many", "count"
- "תראה מה יש", "מה קורה", "מה עושים" (slang: what's up / what's happening)
- "מה מתוכנן", "מה בתכנון", "מה על הפרק", "מה מסתדר" (what's planned/arranged)
- "איזה אירועים", "אילו אירועים" (which events)
- "מתי", "מתי יש לי", "מתי ה", "מתי זה", "when is", "when's", "when do I have" (asking when specific event is)
- "מתי הבר מצווה", "מתי הפגישה", "מתי האירוע" (when is the bar mitzvah/meeting/event)
- English: "what do I have", "what have I got", "what's on", "what events", "my events", "my schedule"
→ search_event/list_events

REMINDERS (CRITICAL - separate from events!):
- "הצג תזכורות", "תראה תזכורות", "מה התזכורות", "show reminders", "list reminders"
- "התזכורות שלי", "כל התזכורות", "my reminders", "all reminders"
- "מה יש לי של תזכורות", "רשימת תזכורות", "איזה תזכורות יש"
- "הראה לי מה תזכרתי", "מה שקבעתי לעצמי", "מה לתזכר"
- English: "show my reminders", "what reminders", "list my reminders"
→ list_reminders

UPDATE/EDIT (CRITICAL - Distinguish between reminders and events):
REMINDER Updates (use update_reminder):
- If message contains "תזכורת" → update_reminder
- If updating recurring item (mentions "ימי X", "כל X") → likely update_reminder
- "עדכן תזכורת", "שנה תזכורת" → update_reminder
- "עדכן ללכת לאימון" (if "ללכת לאימון" is a known reminder title) → update_reminder
- "תזכורת של ימי ראשון, תעדכן" → update_reminder

EVENT Updates (use update_event):
- If message contains "אירוע", "פגישה", "meeting" → update_event
- "עדכן פגישה", "שנה אירוע" → update_event
- If not explicitly a reminder → default to update_event

- "עדכן", "שנה", "תשנה", "תעדכן", "דחה", "הזז", "update", "change", "edit", "modify", "reschedule", "postpone", "move"

DELETE (ALL CONJUGATIONS & SLANG):
- CANCEL: "תבטל", "בטל", "לבטל", "ביטול", "מבטל", "ביטלתי", "ביטלת", "אבטל"
- DELETE: "תמחוק", "מחק", "למחוק", "מחיקה", "מוחק", "מחקתי", "מחקת", "אמחק"
- REMOVE: "תסיר", "הסר", "להסיר", "הסרה", "מסיר"
- THROW OUT: "תזרוק", "זרוק", "לזרוק" (slang: throw it away)
- FORGET: "תשכח", "שכח", "לשכוח", "forget it", "never mind"
- SLANG: "תעיף", "עיף" (kick out), "תוריד" (take down)
- English: "delete", "cancel", "remove", "drop"
- BULK DELETE: "מחק הכל", "תמחוק את כל", "תבטל את כל", "delete all", "cancel all" → set deleteAll: true
→ delete_event/delete_reminder

COMPLETE:
- "סיים", "סיימתי", "הושלם", "נעשה", "done", "finished", "completed", "mark done" → complete_task

COMMUNICATION:
- "שלח", "כתוב", "send", "write", "message" → send_message
- "הוסף קשר", "add contact", "צור קשר" → add_contact

COMMENTS (NEW FEATURE):
ADD COMMENT:
- "הוסף הערה ל[אירוע]: [טקסט]", "רשום ב[אירוע]: [טקסט]", "add comment to [event]: [text]" → add_comment
- With priority: "הוסף הערה דחוף/חשוב ל[אירוע]: [טקסט]" → add_comment with priority: urgent/high
- With reminder: "הוסף הערה ל[אירוע] והזכר לי [זמן]: [טקסט]" → add_comment with reminderTime
- Examples: "הוסף הערה לרופא שיניים: תזכיר על הביק", "רשום בפגישה דחוף: להביא מסמכים"

VIEW COMMENTS:
- "הצג הערות [אירוע]", "מה רשום ב[אירוע]", "הערות של [אירוע]", "show comments for [event]" → view_comments
- Examples: "הצג הערות רופא שיניים", "מה רשום בפגישה"

DELETE COMMENT:
- By index: "מחק הערה [מספר]", "מחק הערה [מספר] מ[אירוע]", "delete comment [number]" → delete_comment with deleteBy: "index"
- Last: "מחק הערה אחרונה", "מחק את ההערה האחרונה", "delete last comment" → delete_comment with deleteBy: "last"
- By text: "מחק \"[טקסט]\"", "מחק הערה \"[טקסט]\"" → delete_comment with deleteBy: "text"
- Examples: "מחק הערה 2", "מחק הערה אחרונה מרופא שיניים", "מחק \"להביא מסמכים\""

DASHBOARD (NEW FEATURE):
- "תן לי לוח", "דף סיכום", "דף אישי", "לוח סיכום", "סיכום", "dashboard", "summary page", "my page" → generate_dashboard
- "רוצה לראות הכל", "תראה לי הכל", "show me everything", "overview" → generate_dashboard
- Examples: "תן לי דף סיכום", "רוצה לוח אישי", "תראה לי סיכום"

URGENCY DETECTION:
- "דחוף", "urgent", "ASAP", "עכשיו", "מיידי" → urgency: "urgent"
- "חשוב", "important", "critical", "חייב" → urgency: "important"

NEGATION (return unknown):
- "לא משנה", "תשכח", "never mind", "לא רלוונטי" → unknown with clarification

Negation & Confusion Detection (IMPORTANT - return unknown with low confidence):
- "לא הבנתי", "לא ברור", "מה", "what?", "I don't understand" → unknown (confidence: 0.2)
- Questions asking for clarification → unknown with clarificationNeeded
- Empty or very short messages → unknown

Date Parsing (CRITICAL - always use current time + offset for relative times):
- Current time (ALREADY in ${userTimezone} with offset): ${currentDate}
- DO NOT adjust for timezone again - the timestamp above is already correct for the user's location

RELATIVE DATES (CRITICAL - Return the HEBREW TEXT as-is, NOT ISO dates):
- "מחר" → return dateText: "מחר" (will be parsed server-side)
- "מחרתיים", "יומיים" → return dateText: "מחרתיים"
- "יום רביעי", "ביום ד" → return dateText: "יום רביעי"
- "השבוע", "השבוע הזה", "בשבוע", "לשבוע", "this week" → return dateText: "השבוע"
- "שבוע הבא", "בשבוע הבא", "לשבוע הבא", "שבוע הקרוב", "next week" → return dateText: "שבוע הבא"
- "החודש", "החודש הזה", "בחודש", "this month" → return dateText: "החודש"
- "חודש הבא", "בחודש הבא", "next month" → return dateText: "חודש הבא"

IMPORTANT: For Hebrew relative dates, return the ORIGINAL HEBREW TEXT in dateText field, NOT an ISO date!

RELATIVE TIMES:
- "בעוד 2 דקות", "עוד דקה" → current time + N minutes
- "בעוד שעה", "בעוד שעתיים" → current time + N hours
- "בעוד שבוע" → one week from now
- "בעוד חצי שעה" → current time + 30 minutes

TIME OF DAY (CRITICAL - Extract ALL time formats, including WITHOUT colons):
- "בבוקר", "בערב", "בצהריים", "בלילה" → morning (9:00), evening (18:00), noon (12:00), night (21:00)
- "ב-3", "בשעה 3" → 15:00 today (3 PM)
- "ב-15:00", "ב15" → 15:00 today
- "לשעה 14:00", "בשעה 14:00", "ב-14:00" → EXACTLY 14:00 (DO NOT default to 00:00!)
- "לשעה 14" (NO colon) → EXACTLY 14:00 with 00 minutes (user didn't specify minutes)
- "ל 19:00", "ל 19:30", "ל-19:00" → EXACTLY 19:00, 19:30 (ל without שעה)
- "תעדכן שעה ל 19:00" → time: 19:00
- "8 בערב" → 20:00 today

EXPLICIT DATES (CRITICAL - Support all separator types):
- "05/01/2025", "1.5.25", "18.10", "18/10", "18-10" → explicit date (dots, slashes, dashes all valid)
- "3 באוקטובר", "3 לאוקטובר" → October 3rd
- IMPORTANT: "18.10" means October 18th (DD.MM format)

CRITICAL TIME EXTRACTION:
- ALWAYS extract the FULL time from the user's message into BOTH fields:
  1. "date": Full ISO 8601 with correct time → "2025-11-12T14:00:00+02:00"
  2. "dateText": Include the time part → "מחר לשעה 14:00" (NOT just "מחר"!)
- Never return times in the past! Always validate against current time ${currentDate}
- Example: "קבע למחר פגישה לשעה 14:00" → {"date":"2025-11-12T14:00:00+02:00","dateText":"מחר לשעה 14:00"}
- Example: "מחר ב-3" → {"date":"2025-11-12T15:00:00+02:00","dateText":"מחר ב-3"}

Contact Recognition:
- Match against contact names, relations, and aliases
- "דני" matches if contact exists with name="דני" or alias includes "דני"
- "אמא" matches if relation="אמא"

CRITICAL - Event Title Extraction for Delete/Update:
- Extract PARTIAL titles for flexible matching
- "תבטל את הפגישה עם אשתי" → title: "פגישה עם אשתי" OR "אשתי" OR "פגישה"
- "מחק את האירוע עם דני" → title: "דני" (will match "פגישה עם דני", "אירוע דני", etc.)
- ALWAYS extract key nouns/names, not just full phrase
- Prefer matching by contact name + event type over exact title match

KEY EXAMPLES (cover all intents):
1. CREATE EVENT WITH TIME: "קבע פגישה עם דני מחר ב-3" → {"intent":"create_event","confidence":0.95,"event":{"title":"פגישה עם דני","date":"2025-11-12T15:00:00+02:00","dateText":"מחר ב-3","contactName":"דני"}} (CRITICAL: include BOTH date ISO and dateText with time!)
2. CREATE EVENT EXPLICIT TIME: "קבע למחר פגישה עם יולי לשעה 14:00" → {"intent":"create_event","confidence":0.95,"event":{"title":"פגישה עם יולי","date":"2025-11-12T14:00:00+02:00","dateText":"מחר לשעה 14:00","contactName":"יולי"}} (CRITICAL: "לשעה 14:00" = 14:00 in ISO!)
3. COMPLEX EVENT WITH ALL DETAILS: "משחק כדורגל נתניה סכנין יום ראשון 5 באוקטובר 20:00 אצטדיון נתניה" → {"intent":"create_event","confidence":0.95,"event":{"title":"משחק כדורגל נתניה סכנין","date":"2025-10-05T20:00:00+03:00","dateText":"יום ראשון 5 באוקטובר 20:00","location":"אצטדיון נתניה"}} (CRITICAL: Extract ALL details - title, date with time, and location!)
4. CREATE REMINDER: "תזכיר לי בעוד שעתיים להתקשר לאמא" → {"intent":"create_reminder","confidence":0.9,"reminder":{"title":"התקשר לאמא","dueDate":"<now+2h ISO>"}}
5. SEARCH BY TITLE: "מתי רופא שיניים?" → {"intent":"search_event","confidence":0.95,"event":{"title":"רופא שיניים"}} (CRITICAL: "מתי" = search, NOT create!)
6. LIST EVENTS TODAY: "מה יש לי היום?" → {"intent":"list_events","confidence":0.95,"event":{"dateText":"היום"}} (CRITICAL: ALWAYS extract "היום" to dateText!)
6b. LIST EVENTS TODAY (PAST TENSE): "מה היה לי היום?" → {"intent":"list_events","confidence":0.95,"event":{"dateText":"היום"}} (CRITICAL: "היה" = past tense, still means TODAY!)
7. LIST EVENTS THIS WEEK: "מה יש לי השבוע?" → {"intent":"list_events","confidence":0.95,"event":{"dateText":"השבוע"}} (use dateText for Hebrew relative dates)
7. DELETE WITH TITLE: "תבטל בדיקת דם" → {"intent":"delete_event","confidence":0.9,"event":{"title":"בדיקת דם"}} (CRITICAL: partial title, fuzzy match)
8. DELETE ALL: "מחק את כל הפגישות" → {"intent":"delete_event","confidence":0.95,"event":{"deleteAll":true}} (CRITICAL: set deleteAll flag for bulk operations!)
9. UPDATE EVENT: "עדכן פגישה עם דני ל-5 אחרי הצהריים" → {"intent":"update_event","confidence":0.9,"event":{"title":"פגישה עם דני","date":"<today 17:00 ISO>","dateText":"5 אחרי הצהריים"}}
9b. UPDATE REMINDER WITH TIME: "תזכורת של ימי ראשון, תעדכן שעה ל 19:00" → {"intent":"update_reminder","confidence":0.9,"reminder":{"title":"ימי ראשון","dueDate":"<next_sunday 19:00 ISO>"}} (CRITICAL: "תזכורת" = update_reminder, "ל 19:00" = time 19:00)
9c. UPDATE REMINDER BY EXACT TITLE: "עדכן ללכת לאימון לשעה 19:30" → {"intent":"update_reminder","confidence":0.9,"reminder":{"title":"ללכת לאימון","dueDate":"<date_with_19:30 ISO>"}} (CRITICAL: "ללכת לאימון" is reminder title, extract time 19:30)
9d. UPDATE REMINDER BY PARTIAL TITLE: "עדכן אימון לשעה 19:30" → {"intent":"update_reminder","confidence":0.9,"reminder":{"title":"אימון","dueDate":"<date_with_19:30 ISO>"}} (CRITICAL: partial match "אימון", extract time)
10. URGENCY: "דחוף! פגישה עם הבוס מחר ב-9" → {"intent":"create_event","confidence":0.95,"urgency":"urgent","event":{"title":"פגישה עם הבוס","date":"2025-11-12T09:00:00+02:00","dateText":"מחר ב-9"}}
11. UNKNOWN/CLARIFY: "קבע משהו" → {"intent":"unknown","confidence":0.3,"clarificationNeeded":"מה תרצה לקבוע? אירוע או תזכורת?"}
12. ADD CONTACT: "הוסף קשר דני 052-1234567 חבר שלי" → {"intent":"add_contact","confidence":0.95,"contact":{"name":"דני","phone":"0521234567","relation":"חבר"}}

CONVERSATION CONTEXT:
- If conversation history is provided, use it to understand references like "this", "that", "it"
- If user says just a time like "14:00" and previous context had a date/event, combine them
- If user refers to "זה" (this), "זה התאריך" (this date), look at previous messages for the date
- Example: Previous: "what about 11.11.2025?" Current: "remind doctor for this date at 14:00" → date: 11.11.2025, time: 14:00`;

      // Build messages array with conversation history
      const messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
        {
          role: 'system',
          content: systemPrompt
        }
      ];

      // Add conversation history if provided (last 5 messages for context)
      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-5);
        messages.push(...recentHistory);
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: userMessage
      });

      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-nano-high', // Using GPT-5 nano for 95% cost savings vs GPT-5
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temperature for more consistent parsing
        max_tokens: 500
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      const parsed = JSON.parse(content) as NLPIntent;

      logger.info('NLP parsed intent', {
        userMessage,
        intent: parsed.intent,
        confidence: parsed.confidence
      });

      return parsed;

    } catch (error) {
      logger.error('Failed to parse intent with NLP', { error, userMessage });

      // Fallback to unknown intent
      return {
        intent: 'unknown',
        confidence: 0,
        clarificationNeeded: 'לא הבנתי את הבקשה. אנא נסה שוב או שלח /תפריט לתפריט הראשי'
      };
    }
  }

  /**
   * Test connection to OpenAI API
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-nano-high',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 5
      });

      logger.info('OpenAI API connection successful');
      return true;
    } catch (error) {
      logger.error('OpenAI API connection failed', { error });
      return false;
    }
  }
}
