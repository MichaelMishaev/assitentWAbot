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
    leadTimeMinutes?: number; // Minutes BEFORE dueDate to send reminder (e.g., 1440 for 1 day before)
    notes?: string; // Additional notes
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
    "recurrence": "RRULE format (optional)",
    "notes": "additional notes or comments (optional)"
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

CRITICAL - TITLE EXTRACTION RULES:
⚠️ NEVER extract meta-phrases as event titles:
- "כל", "כל ה", "הכל", "כולם" = ALL (NOT a title!)
- "האירועים שלי", "הפגישות שלי" = my events/meetings (NOT a title!)
- If phrase contains "כל ה" + generic noun (אירועים, פגישות, תזכורות) → NO title field!
- If phrase is just possessive descriptor ("שלי", "שלנו", "שלך") → NO title field!
- Generic questions ("מה", "איזה", "אילו") + generic noun → NO title field!
⚠️ Only extract SPECIFIC event names as titles: "רופא שיניים", "פגישה עם דני", "משחק כדורגל"
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
- DELETE: "תמחוק", "תמחק", "מחק", "למחוק", "מחיקה", "מוחק", "מחקתי", "מחקת", "אמחק"
- REMOVE: "תסיר", "הסר", "להסיר", "הסרה", "מסיר"
- THROW OUT: "תזרוק", "זרוק", "לזרוק" (slang: throw it away)
- FORGET: "תשכח", "שכח", "לשכוח", "forget it", "never mind"
- SLANG: "תעיף", "עיף" (kick out), "תוריד" (take down)
- English: "delete", "cancel", "remove", "drop"
- **BULK DELETE (BUG FIX #18 - CRITICAL):**
  * "מחק הכל", "מחק את כל האירועים", "מחק את כולם"
  * "תמחוק הכל", "תמחוק את כל", "תמחוק את כולם"
  * "בטל הכל", "תבטל הכל", "תבטל את כל האירועים", "בטל את כולם"
  * "נקה הכל", "תנקה הכל", "ניקוי כולל"
  * "הסר הכל", "תסיר הכל", "תסיר את כולם"
  * English: "delete all", "cancel all", "remove all", "delete everything", "clear all"
  * **→ MUST set deleteAll: true in event object**
→ delete_event/delete_reminder

COMPLETE:
- "סיים", "סיימתי", "הושלם", "נעשה", "done", "finished", "completed", "mark done" → complete_task

COMMUNICATION:
- "שלח", "כתוב", "send", "write", "message" → send_message
- "הוסף קשר", "add contact", "צור קשר" → add_contact

COMMENTS (NEW FEATURE):
ADD COMMENT - Natural Language Patterns (CRITICAL - Support mixed syntax):
META-INSTRUCTIONS (User explaining what to do):
- "זאת הערה", "זה הערה", "זו הערה" → Indicator that following text is a comment
- "לא לשכוח [דבר]" → Extract [דבר] as comment text
- "להביא [דבר]", "לזכור [דבר]", "לשים לב [דבר]" → Action verbs indicate comment content
- These are instructions TO THE ASSISTANT, not part of the comment text!

EXAMPLES OF NATURAL COMMENT EXTRACTION:
- "הפגישה היא עם מיכאל, לא לשכוח להביא מזומנים זאת הערה" → event: "פגישה עם מיכאל", comment: "לא לשכוח להביא מזומנים"
- "אירוע עם דני, זה הערה: להביא המסמכים" → event: "אירוע עם דני", comment: "להביא המסמכים"
- "פגישה מחר ב-3 זו הערה להביא כסף" → event: "פגישה", comment: "להביא כסף"
- "קבע פגישה עם רופא שיניים, לזכור להביא ביקורת קופה" → event: "פגישה עם רופא שיניים", comment: "לזכור להביא ביקורת קופה"

STRUCTURED SYNTAX (Traditional):
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
1b. CREATE EVENT WITH ב+TIME (CRITICAL - BUG FIX #13): "פגישה עם שימי מחר ב17:00" → {"intent":"create_event","confidence":0.95,"event":{"title":"פגישה עם שימי","date":"2025-11-12T17:00:00+02:00","dateText":"מחר ב17:00","contactName":"שימי"}} (CRITICAL: "ב17:00" (with ב prefix) = at 17:00. Extract time EXACTLY as specified! Patterns: "ב14:00", "ב-14:00", "ב 14:00" all mean "at 14:00")
1c. CREATE EVENT ב+TIME VARIATIONS (CRITICAL): "אירוע ב15:00", "פגישה ב-20:00", "מפגש ב 18:30" → all extract time correctly (CRITICAL: Space/dash after ב is optional!)
1d. CREATE EVENT WITH בשעה+TIME (CRITICAL - BUG FIX #15): "מסיבת הפתעה לרחלי מחר בשעה 20:45" → {"intent":"create_event","confidence":0.95,"event":{"title":"מסיבת הפתעה לרחלי","date":"2025-11-13T20:45:00+02:00","dateText":"מחר בשעה 20:45"}} (CRITICAL: "בשעה 20:45" (with word "שעה") = at time 20:45. Extract time EXACTLY! Patterns: "בשעה 14:00", "בשעה 20:45", "בשעה: 18:30" all mean the specified time)
1e. CREATE EVENT בשעה VARIATIONS (CRITICAL): "אירוע בשעה 15:00", "פגישה בשעה: 16:30", "מפגש בשעה 9 בבוקר" → all extract time correctly (CRITICAL: "בשעה" = "at time" - MUST extract time value!)
2. CREATE EVENT EXPLICIT TIME: "קבע למחר פגישה עם יולי לשעה 14:00" → {"intent":"create_event","confidence":0.95,"event":{"title":"פגישה עם יולי","date":"2025-11-12T14:00:00+02:00","dateText":"מחר לשעה 14:00","contactName":"יולי"}} (CRITICAL: "לשעה 14:00" = 14:00 in ISO!)
3. COMPLEX EVENT WITH ALL DETAILS: "משחק כדורגל נתניה סכנין יום ראשון 5 באוקטובר 20:00 אצטדיון נתניה" → {"intent":"create_event","confidence":0.95,"event":{"title":"משחק כדורגל נתניה סכנין","date":"2025-10-05T20:00:00+03:00","dateText":"יום ראשון 5 באוקטובר 20:00","location":"אצטדיון נתניה"}} (CRITICAL: Extract ALL details - title, date with time, and location!)
4. CREATE REMINDER: "תזכיר לי בעוד שעתיים להתקשר לאמא" → {"intent":"create_reminder","confidence":0.9,"reminder":{"title":"התקשר לאמא","dueDate":"<now+2h ISO>"}}
4b. CREATE REMINDER WITH NOTES (CRITICAL): "תזכיר לי לבדוק על הטיסה של תומר , ביום רביעי בשעה 11 בבוקר. הערות - טיסה מאבו דאבי צריכה לנחות ב16:45" → {"intent":"create_reminder","confidence":0.95,"reminder":{"title":"בדוק על הטיסה של תומר","dueDate":"2025-10-22T11:00:00+03:00","notes":"טיסה מאבו דאבי צריכה לנחות ב16:45"}} (CRITICAL: Extract notes after "הערות -", "הערה:", "note:", "notes:", or any dash/colon separator!)
4c. REMINDER WITH INLINE NOTES (CRITICAL): "תזכיר לי לקנות חלב מחר - חשוב! 3 ליטר" → {"intent":"create_reminder","confidence":0.9,"reminder":{"title":"לקנות חלב","dueDate":"<tomorrow 12:00 ISO>","notes":"חשוב! 3 ליטר"}} (CRITICAL: Text after " - " is notes if it's not a date/time!)
4d. REMINDER WITH LOCATION/PERSON (CRITICAL - BUG FIX): "תזכיר לי פגישה אצל אלבז ב14:45" → {"intent":"create_reminder","confidence":0.95,"reminder":{"title":"פגישה אצל אלבז","dueDate":"<today 14:45 ISO>"}} (CRITICAL: "אצל" = at/with location/person - MUST include full context "אצל [name/place]" in title! Common patterns: "אצל רופא", "אצל דני", "אצל הבנק")
4e. REMINDER WITH "ETZEL" VARIATIONS (CRITICAL): "תזכיר לי ללכת אצל הרופא מחר" → {"intent":"create_reminder","confidence":0.95,"reminder":{"title":"ללכת אצל הרופא","dueDate":"<tomorrow 12:00 ISO>"}} (CRITICAL: Always include "אצל" and what follows it in the title!)
4f. REMINDER WITH ל PREFIX VERBS (CRITICAL - BUG FIX #11): "קבע תזכורת ל 16:00 לנסוע הביתה" → {"intent":"create_reminder","confidence":0.95,"reminder":{"title":"לנסוע הביתה","dueDate":"<today 16:00 ISO>"}} (CRITICAL: NEVER strip the ל prefix from infinitive verbs! "לנסוע" is the correct form, NOT "נסוע". Hebrew infinitive verbs start with ל - keep it!)
4g. REMINDER WITH OTHER ל VERBS (CRITICAL): "תזכיר לי לקנות חלב" → {"intent":"create_reminder","confidence":0.95,"reminder":{"title":"לקנות חלב","dueDate":"<today 12:00 ISO>"}} (CRITICAL: Keep ל prefix: "לקנות", "לנסוע", "ללכת", "לעשות", etc.)
4h. REMINDER MINIMAL FORM (CRITICAL - BUG FIX #12): "תזכיר לי" → {"intent":"create_reminder","confidence":0.95,"reminder":{"title":"","dueDate":"<today 12:00 ISO>"}} (CRITICAL: "תזכיר לי" alone IS valid! User will provide details when prompted. This is the MOST BASIC Hebrew reminder phrase - MUST be 0.95+ confidence!)
4i. REMINDER STANDALONE VARIATIONS (CRITICAL): "הזכר לי", "תזכיר", "תזכירי לי" → all create_reminder with 0.95 confidence (CRITICAL: All variations of "remind me" must have HIGH confidence!)
5. SEARCH BY TITLE: "מתי רופא שיניים?" → {"intent":"search_event","confidence":0.95,"event":{"title":"רופא שיניים"}} (CRITICAL: "מתי" = search, NOT create!)
6. LIST EVENTS TODAY: "מה יש לי היום?" → {"intent":"list_events","confidence":0.95,"event":{"dateText":"היום"}} (CRITICAL: ALWAYS extract "היום" to dateText!)
6b. LIST EVENTS TODAY (PAST TENSE): "מה היה לי היום?" → {"intent":"list_events","confidence":0.95,"event":{"dateText":"היום"}} (CRITICAL: "היה" = past tense, still means TODAY!)
7. LIST EVENTS THIS WEEK: "מה יש לי השבוע?" → {"intent":"list_events","confidence":0.95,"event":{"dateText":"השבוע"}} (use dateText for Hebrew relative dates)
7a. LIST ALL EVENTS - NO TITLE FILTER (CRITICAL): "כל האירועים שלי" → {"intent":"list_events","confidence":0.95,"event":{}} (CRITICAL: "כל האירועים" = list ALL, NOT a title! Return empty event object, NO title field!)
7b. LIST ALL EVENTS VARIATIONS (CRITICAL): "הראה לי את כל האירועים" → {"intent":"list_events","confidence":0.95,"event":{}} (CRITICAL: "כל" = ALL, not a specific event title!)
7c. LIST ALL EVENTS WITH POSSESSIVE (CRITICAL): "כל הפגישות שלי" → {"intent":"list_events","confidence":0.95,"event":{}} (CRITICAL: "כל ה..." + "שלי" = list all, NO title!)
7d. LIST EVERYTHING (CRITICAL): "הכל" → {"intent":"list_events","confidence":0.95,"event":{}} (CRITICAL: "הכל" alone means show everything, NO title!)
7. DELETE WITH TITLE: "תבטל בדיקת דם" → {"intent":"delete_event","confidence":0.9,"event":{"title":"בדיקת דם"}} (CRITICAL: partial title, fuzzy match)
7f. DELETE WITHOUT TITLE (BUG FIX #8): "תמחק" → {"intent":"delete_reminder","confidence":0.85,"reminder":{"title":""}} (CRITICAL: "תמחק" alone = delete quoted/last reminder, empty title, router will find context)
7g. DELETE REMINDER WITH TITLE (BUG FIX #9 - CRITICAL): "מחק המקרר" → {"intent":"delete_reminder","confidence":0.85,"reminder":{"title":"המקרר"}} (CRITICAL: "מחק X" = delete reminder named X, NOT title="מחק"! The verb "מחק" is the ACTION, everything after it is the title!)
7h. DELETE REMINDER EXPLICIT (BUG FIX #9): "מחק תזכורת המקרר" → {"intent":"delete_reminder","confidence":0.9,"reminder":{"title":"המקרר"}} (CRITICAL: "מחק תזכורת X" = delete reminder X, strip "תזכורת" from title!)
8. DELETE ALL: "מחק את כל הפגישות" → {"intent":"delete_event","confidence":0.95,"event":{"deleteAll":true}} (CRITICAL: set deleteAll flag for bulk operations!)
8b. DELETE ALL EVENTS (BUG FIX #6): "מחק את כל האירועים" → {"intent":"delete_event","confidence":0.95,"event":{"deleteAll":true}} (CRITICAL: "מחק את כל האירועים" = delete ALL events, NOT a title! Set deleteAll flag!)
9. UPDATE EVENT: "עדכן פגישה עם דני ל-5 אחרי הצהריים" → {"intent":"update_event","confidence":0.9,"event":{"title":"פגישה עם דני","date":"<today 17:00 ISO>","dateText":"5 אחרי הצהריים"}}
9b. UPDATE REMINDER WITH TIME: "תזכורת של ימי ראשון, תעדכן שעה ל 19:00" → {"intent":"update_reminder","confidence":0.9,"reminder":{"title":"ימי ראשון","dueDate":"<next_sunday 19:00 ISO>"}} (CRITICAL: "תזכורת" = update_reminder, "ל 19:00" = time 19:00)
9c. UPDATE REMINDER BY EXACT TITLE: "עדכן ללכת לאימון לשעה 19:30" → {"intent":"update_reminder","confidence":0.9,"reminder":{"title":"ללכת לאימון","dueDate":"<date_with_19:30 ISO>"}} (CRITICAL: "ללכת לאימון" is reminder title, extract time 19:30)
9d. UPDATE REMINDER BY PARTIAL TITLE: "עדכן אימון לשעה 19:30" → {"intent":"update_reminder","confidence":0.9,"reminder":{"title":"אימון","dueDate":"<date_with_19:30 ISO>"}} (CRITICAL: partial match "אימון", extract time)
9e. UPDATE REMINDER WITHOUT TITLE (BUG FIX #7): "תשנה ל 17:30" → {"intent":"update_reminder","confidence":0.85,"reminder":{"title":"","dueDate":"<date_with_17:30 ISO>"}} (CRITICAL: "תשנה ל" = change to, no title specified = empty title, router will find last created reminder, extract time 17:30)
10. URGENCY: "דחוף! פגישה עם הבוס מחר ב-9" → {"intent":"create_event","confidence":0.95,"urgency":"urgent","event":{"title":"פגישה עם הבוס","date":"2025-11-12T09:00:00+02:00","dateText":"מחר ב-9"}}
11. UNKNOWN/CLARIFY: "קבע משהו" → {"intent":"unknown","confidence":0.3,"clarificationNeeded":"מה תרצה לקבוע? אירוע או תזכורת?"}
12. ADD CONTACT: "הוסף קשר דני 052-1234567 חבר שלי" → {"intent":"add_contact","confidence":0.95,"contact":{"name":"דני","phone":"0521234567","relation":"חבר"}}
13. CREATE EVENT WITH MIXED COMMENT (CRITICAL - Natural language): "הפגישה היא עם מיכאל, לא לשכוח להביא מזומנים זאת הערה" → {"intent":"create_event","confidence":0.95,"event":{"title":"פגישה עם מיכאל","contactName":"מיכאל","notes":"לא לשכוח להביא מזומנים"}} (CRITICAL: "זאת הערה" is meta-instruction, extract "לא לשכוח להביא מזומנים" as notes!)

CONVERSATION CONTEXT:
- If conversation history is provided, use it to understand references like "this", "that", "it"
- If user says just a time like "14:00" and previous context had a date/event, combine them
- If user refers to "זה" (this), "זה התאריך" (this date), look at previous messages for the date
- Example: Previous: "what about 11.11.2025?" Current: "remind doctor for this date at 14:00" → date: 11.11.2025, time: 14:00

MULTI-LINE MESSAGES (CRITICAL - Bug #3 Fix):
- Users often send event details on separate lines (especially on mobile)
- Parse EACH line for its semantic meaning (title, date, time, location)
- Combine all extracted information into a single event

Example patterns:
1. Simple multi-line:
   "פגישה עם מיכאל על בירה
    20.10
    16:00
    מרפיס פולג"
   → title: "פגישה על בירה עם מיכאל", date: "2025-10-20T16:00:00+03:00", location: "מרפיס פולג"

2. Line-by-line meaning:
   Line 1: Event title + participants
   Line 2: Date (DD.MM or DD/MM format)
   Line 3: Time (HH:MM format)
   Line 4: Location (place name)

3. Recognition rules:
   - If a line contains ONLY digits/dots/slashes (18.10, 20/10) → it's a DATE
   - If a line contains ONLY HH:MM format (16:00, 14:30) → it's a TIME
   - If a line is after date/time lines and contains Hebrew text → it's a LOCATION
   - First line with substantive text → it's the TITLE (+ participants)

4. Critical: Combine date + time into single ISO timestamp:
   Date "20.10" + Time "16:00" → "2025-10-20T16:00:00+03:00"
   Do NOT ask for time again if it's on a separate line!`;

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
        model: 'gpt-4o-mini', // Using GPT-4o mini - best performance at $0.15/$0.60 per 1M tokens
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
        model: 'gpt-4o-mini',
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
