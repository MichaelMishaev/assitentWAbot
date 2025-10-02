import OpenAI from 'openai';
import logger from '../utils/logger';
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
  intent: 'create_event' | 'create_reminder' | 'search_event' | 'list_events' | 'delete_event' | 'delete_reminder' | 'update_event' | 'update_reminder' | 'complete_task' | 'send_message' | 'add_contact' | 'unknown';
  confidence: number;
  urgency?: 'urgent' | 'important' | 'normal'; // NEW: Emotional context
  event?: {
    title: string;
    date?: string; // ISO 8601 datetime
    endDate?: string; // ISO 8601 datetime for multi-day events
    location?: string;
    contactName?: string;
    notes?: string;
  };
  reminder?: {
    title: string;
    dueDate?: string; // ISO 8601 datetime
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
  "intent": "create_event|create_reminder|search_event|list_events|delete_event|delete_reminder|update_event|update_reminder|complete_task|send_message|add_contact|unknown",
  "confidence": 0.0-1.0,
  "urgency": "urgent|important|normal (optional)",
  "event": {
    "title": "string",
    "date": "ISO 8601 datetime in ${userTimezone} OR Hebrew date text (e.g., 'מחר', 'שבוע הבא')",
    "dateText": "ORIGINAL Hebrew/English date text from user query (e.g., 'שבוע הקרוב', 'next week')",
    "endDate": "ISO 8601 datetime (optional, for multi-day events)",
    "location": "string (optional)",
    "contactName": "contact name if mentioned",
    "notes": "additional notes (optional)"
  },
  "reminder": {
    "title": "string",
    "dueDate": "ISO 8601 datetime in ${userTimezone}",
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
  "clarificationNeeded": "string - ask user for missing info (optional)"
}

Intent Detection Rules:
CREATE:
- "קבע", "תקבע", "צור", "הוסף", "schedule", "create", "add", "new" → create_event/create_reminder
- Event keywords: "פגישה", "אירוע", "meeting", "event", "appointment"
- Reminder keywords: "תזכיר", "תזכורת", "remind", "reminder", "אל תשכח", "don't forget"

SEARCH/LIST (ALL VARIATIONS):
- "מה יש לי", "מה יש", "יש לי", "שיש לי", "האירועים שלי", "האירועים שיש", "האירועים שיש לי"
- "מה יש אצלי", "מה יש בלוז", "מה בתכנית" (what's in my schedule/plan)
- "הראה", "תראה", "הצג", "תציג", "תן לי", "give me", "show me"
- "רשימה", "רשימת", "list", "display"
- "מה הקרוב", "מה הבא", "הבא בתור", "הקרוב שלי", "מה הכי קרוב"
- "כמה אירועים", "כמה פגישות", "how many", "count"
- "תראה מה יש", "מה קורה", "מה עושים" (slang: what's up / what's happening)
- "מה מתוכנן", "מה בתכנון", "מה על הפרק", "מה מסתדר" (what's planned/arranged)
- "איזה אירועים", "אילו אירועים" (which events)
- English: "what do I have", "what have I got", "what's on", "what events", "my events", "my schedule"
→ search_event/list_events

UPDATE/EDIT:
- "עדכן", "שנה", "תשנה", "תעדכן", "דחה", "הזז", "update", "change", "edit", "modify", "reschedule", "postpone", "move" → update_event/update_reminder

DELETE (ALL CONJUGATIONS & SLANG):
- CANCEL: "תבטל", "בטל", "לבטל", "ביטול", "מבטל", "ביטלתי", "ביטלת", "אבטל"
- DELETE: "תמחוק", "מחק", "למחוק", "מחיקה", "מוחק", "מחקתי", "מחקת", "אמחק"
- REMOVE: "תסיר", "הסר", "להסיר", "הסרה", "מסיר"
- THROW OUT: "תזרוק", "זרוק", "לזרוק" (slang: throw it away)
- FORGET: "תשכח", "שכח", "לשכוח", "forget it", "never mind"
- SLANG: "תעיף", "עיף" (kick out), "תוריד" (take down)
- English: "delete", "cancel", "remove", "drop"
→ delete_event/delete_reminder

COMPLETE:
- "סיים", "סיימתי", "הושלם", "נעשה", "done", "finished", "completed", "mark done" → complete_task

COMMUNICATION:
- "שלח", "כתוב", "send", "write", "message" → send_message
- "הוסף קשר", "add contact", "צור קשר" → add_contact

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

TIME OF DAY:
- "בבוקר", "בערב", "בצהריים", "בלילה" → morning (9:00), evening (18:00), noon (12:00), night (21:00)
- "ב-3", "בשעה 3" → 15:00 today (3 PM)
- "ב-15:00", "ב15" → 15:00 today
- "8 בערב" → 20:00 today

EXPLICIT DATES:
- "05/01/2025", "1.5.25" → explicit date
- "3 באוקטובר", "3 לאוקטובר" → October 3rd

IMPORTANT:
- Never return times in the past! Always validate against current time ${currentDate}
- When user specifies a time like "14:00", return it EXACTLY as "2025-MM-DDT14:00:00+[offset]" in user's timezone
- Example: If user says "מחר ב-14:00" and tomorrow is Nov 11, 2025, return: "2025-11-11T14:00:00+02:00" (Israel winter time)

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

Examples:
1. "קבע פגישה עם דני מחר ב-3"
   → {"intent":"create_event","confidence":0.95,"event":{"title":"פגישה עם דני","date":"<tomorrow at 15:00 ISO>","contactName":"דני"}}

2. "תזכיר לי להתקשר לאמא ביום רביעי בבוקר"
   → {"intent":"create_reminder","confidence":0.9,"reminder":{"title":"התקשר לאמא","dueDate":"<next Wed 9:00 ISO>"}}

3. "מה יש לי מחר?"
   → {"intent":"search_event","confidence":0.95,"event":{"date":"<tomorrow ISO>"}}

4. "מה האירוע הקרוב?" or "מה הבא?"
   → {"intent":"list_events","confidence":0.95}
   IMPORTANT: NO DATE field for upcoming/next queries!

5. "תמחוק את הפגישה עם אשתי מחר" or "בטל אירוע"
   → {"intent":"delete_event","confidence":0.9,"event":{"title":"פגישה עם אשתי","date":"<tomorrow ISO>"}}
   IMPORTANT: Extract event title and optionally date to identify which event to delete

6. "שלח לדני שאני אאחר"
   → {"intent":"send_message","confidence":0.85,"message":{"recipient":"דני","content":"אני אאחר"}}

7. "דחוף! פגישה עם הבוס מחר ב-9"
   → {"intent":"create_event","confidence":0.95,"urgency":"urgent","event":{"title":"פגישה עם הבוס","date":"<tomorrow at 9:00 ISO>"}}

8. "עדכן את הפגישה עם דני ל-5 אחרי הצהריים"
   → {"intent":"update_event","confidence":0.9,"event":{"title":"פגישה עם דני","date":"<today at 17:00 ISO>","contactName":"דני"}}

9. "דחה את האירוע מחר למחרתיים"
   → {"intent":"update_event","confidence":0.9,"event":{"date":"<day after tomorrow ISO>"}}

10. "הראה לי מה יש השבוע"
   → {"intent":"list_events","confidence":0.95,"event":{"date":"<this week ISO range>"}}

11. "סיימתי את המשימה"
   → {"intent":"complete_task","confidence":0.9}

12. "תזכיר לי בעוד שעתיים להתקשר לאמא"
   → {"intent":"create_reminder","confidence":0.9,"reminder":{"title":"התקשר לאמא","dueDate":"<current time + 2 hours ISO>"}}

13. "קבע משהו"
   → {"intent":"unknown","confidence":0.3,"clarificationNeeded":"מה תרצה לקבוע? אירוע או תזכורת?"}

14. "לא משנה, תשכח"
   → {"intent":"unknown","confidence":0.2,"clarificationNeeded":"בסדר, אם תצטרך עזרה שלח /תפריט"}

15. "כמה אירועים יש לי היום?"
   → {"intent":"list_events","confidence":0.95,"event":{"date":"<today ISO>"}}

16. "מה האירועים שיש לי?" or "יש לי אירועים?"
   → {"intent":"list_events","confidence":0.95}

17. "תבטל את הפגישה עם אשתי" or "בטל פגישה"
   → {"intent":"delete_event","confidence":0.9,"event":{"title":"פגישה עם אשתי"}}
   IMPORTANT: Extract title for flexible matching

18. "מה קורה השבוע?" (slang: what's happening this week)
   → {"intent":"list_events","confidence":0.85,"event":{"date":"<this week ISO>"}}

19. "תזרוק את האירוע מחר" (slang: throw away the event)
   → {"intent":"delete_event","confidence":0.9,"event":{"date":"<tomorrow ISO>"}}

20. "סבבה, תראה לי מה יש" (slang: cool, show me what's there)
   → {"intent":"list_events","confidence":0.85}

21. "what do I have this week?" or "what's on this week?"
   → {"intent":"list_events","confidence":0.95,"event":{"date":"<this week ISO range>"}}

22. "show me my schedule" or "my events"
   → {"intent":"list_events","confidence":0.9}

23. "מה יש לי השבוע?" or "מה יש לי בשבוע?" (what do I have this week? - ALL HEBREW VARIATIONS)
   → {"intent":"list_events","confidence":0.95,"event":{"date":"<this week ISO range>"}}

24. "תראה לי מה יש השבוע" or "הראה לי מה יש בשבוע" (show me what I have this week)
   → {"intent":"list_events","confidence":0.95,"event":{"date":"<this week ISO>"}}

25. "מה מתוכנן השבוע?" or "מה בתכנית השבוע?" (what's planned/scheduled this week?)
   → {"intent":"list_events","confidence":0.9,"event":{"date":"<this week ISO>"}}

26. "איזה אירועים יש לי השבוע?" or "כמה אירועים יש לי השבוע?" (which/how many events this week?)
   → {"intent":"list_events","confidence":0.95,"event":{"date":"<this week ISO>"}}

27. "יש לי משהו השבוע?" or "יש לי אירועים בשבוע?" (do I have something/events this week?)
   → {"intent":"list_events","confidence":0.9,"event":{"date":"<this week ISO>"}}

28. "מה על הפרק השבוע?" or "מה מסתדר השבוע?" (what's on agenda/arranged this week? - formal)
   → {"intent":"list_events","confidence":0.85,"event":{"date":"<this week ISO>"}}

29. "מה יש לי שבוע הבא?" or "מה יש לי בשבוע הבא?" or "מה יש לי לשבוע הקרוב?" (ALL VARIATIONS)
   → {"intent":"list_events","confidence":0.95,"event":{"dateText":"שבוע הבא"}}

30. "תראה לי מה יש שבוע הבא" or "הראה לי מה קורה בשבוע הבא"
   → {"intent":"list_events","confidence":0.95,"event":{"dateText":"שבוע הבא"}}

31. "מה מתוכנן שבוע הבא?" or "מה בתכנית לשבוע הבא?"
   → {"intent":"list_events","confidence":0.9,"event":{"dateText":"שבוע הבא"}}

32. "מה יש לי השבוע?" or "מה קורה השבוע?"
   → {"intent":"list_events","confidence":0.95,"event":{"dateText":"השבוע"}}

7. "מה?" / "לא ברור"
   → {"intent":"unknown","confidence":0.1,"clarificationNeeded":"שלח /תפריט לתפריט ראשי"}

8. "תזכיר לי בעוד 2 דקות לשלושת נעים"
   → {"intent":"create_reminder","confidence":0.85,"reminder":{"title":"לשלושת נעים","dueDate":"<current time + 2 minutes ISO>"}}

9. "הוסף איש קשר לנה 0544550575"
   → {"intent":"add_contact","confidence":0.9,"contact":{"name":"לנה","phone":"0544550575"}}

10. "צור איש קשר דני 052-1234567 חבר שלי"
   → {"intent":"add_contact","confidence":0.95,"contact":{"name":"דני","phone":"0521234567","relation":"חבר"}}

NOTE: For "בעוד X דקות/שעות" always calculate from current time (${currentDate}), NOT from midnight!

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
        model: 'gpt-4o-mini', // Using mini for cost efficiency, can upgrade to gpt-4o for better accuracy
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
