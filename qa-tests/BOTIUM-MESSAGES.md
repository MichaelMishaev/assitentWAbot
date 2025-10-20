# 📨 Exact Messages Botium Sends to Your Bot

## How Botium Connects to Your Bot

**Current Configuration (botium.json):**
```json
{
  "CONTAINERMODE": "webdriverio",
  "WEBDRIVERIO_URL": "https://web.whatsapp.com",
  "WEBDRIVERIO_INPUT": "div[contenteditable='true'][data-tab='1']",
  "WEBDRIVERIO_SENDBUTTON": "span[data-icon='send']"
}
```

**What this means:**
- Botium opens Chrome browser in headless mode
- Navigates to WhatsApp Web (web.whatsapp.com)
- Types messages into the WhatsApp Web chat input
- Clicks the send button
- Reads bot responses from the chat
- **It's like a real user typing in WhatsApp Web!**

---

## 📋 All Messages Botium Will Send

### Test 1: Bug #2 - Context Loss Reminder Time
**File:** `bug02-context-loss-reminder-time.convo.txt`

**Messages sent:**
1. `תזכיר לי עוד 20 ימים לבטל את המנוי של אמזון`
2. `14:00`

**What it checks:**
- Bot should create reminder with default time (not ask for time)
- Should NOT contain "FAIL" or "באיזו שעה?"

---

### Test 2: Bug #3 - Multi-line Message
**File:** `bug03-multiline-parsing.convo.txt`

**Message sent (multi-line):**
```
פגישה עם מיכאל על בירה
20.10
16:00
מרפיס פולג
```

**What it checks:**
- Response contains "פגישה" AND "מיכאל"
- Response contains "20/10/2025" AND "16:00"
- Response contains "מרפיס פולג"

---

### Test 3: Bug #8 - Reminder Detection
**File:** `bug08-reminder-detection.convo.txt`

**Messages sent:**
1. `תזכורת לקנות חלב מחר`
2. `תזכיר לי לשלם חשמל`

**What it checks:**
- Both messages should create reminders
- Response should contain "תזכורת נקבעה"

---

### Test 4: Bug #9 - Date Without Year
**File:** `bug09-date-without-year.convo.txt`

**Messages sent:**
1. `פגישה 20.10 בשעה 15:00`
2. `אירוע 10.10`

**What it checks:**
- Date should be 2025 or 2026 (not past year 2024)
- Time 15:00 should be extracted
- Response should match pattern `202[56]`

---

### Test 5: Bug #13 - Time Recognition
**File:** `bug13-time-recognition.convo.txt`

**Message sent:**
1. `תקבע לי אירוע של ריקודים לתאריך 1.11 בשעה 13:00`

**What it checks:**
- Response contains "ריקודים ב-1.11 בשעה 13:00"
- Should NOT ask "באיזו שעה?"

---

### Test 6: Bug #14 - Search Tokenization
**File:** `bug14-search-tokenization.convo.txt`

**Messages sent:**
1. `תקבע אירוע חוג בישול לרום ולאמה ב 15.10 בשעה 18:00`
2. `מתי חוג בישול`

**What it checks:**
- Event created with "חוג בישול"
- Search finds event "חוג בישול לרום ולאמה"
- Should NOT say "לא נמצאו אירועים"

---

### Test 7: Bug #15 - Reminder Notes
**File:** `bug15-reminder-notes.convo.txt`

**Message sent:**
1. `תזכיר לי לבדוק על הטיסה של תומר ביום רביעי בשעה 11 בבוקר. הערות - טיסה מאבו דאבי צריכה לנחות ב16:45`

**What it checks:**
- Response contains "הטיסה של תומר"
- Response contains "טיסה מאבו דאבי" (notes extracted!)
- Reminder created successfully

---

### Test 8: Bug #16 - List All Events
**File:** `bug16-list-all-events.convo.txt`

**Messages sent:**
1. `כל האירועים שלי`
2. `הראה לי את כל הפגישות שלי`
3. `הכל`

**What it checks:**
- Should NOT say "לא נמצאו אירועים"
- Should list events (or say "אין לך אירועים" if truly empty)
- Should recognize as "list all" command, not search for title

---

### Test 9: Hebrew Name Participants
**File:** `hebrew-name-participants.convo.txt`

**Messages sent:**
1. `פגישה עם יהודית`
2. `פגישה עם יוסי ודני`

**What it checks:**
- First message: 1 participant only (יהודית)
  - Should NOT split to "יה" and "דית"
  - Should NOT say "2 participants"
- Second message: 2 participants (יוסי AND דני)

---

### Test 10: Search Hebrew Tokenization
**File:** `search-hebrew-tokenization.convo.txt`

**Messages sent:**
1. `פגישה עם יקיר קדם ב-15.10 בשעה 16:00` (create event)
2. `מתי יקיר` (search by first name)
3. `מתי קדם` (search by last name)
4. `מתי יקיר קדם` (search by full name)

**What it checks:**
- Event created with "יקיר קדם"
- Search "יקיר" → finds event
- Search "קדם" → finds event
- Search "יקיר קדם" → finds event
- All should find the event (Hebrew tokenization works!)

---

## 🔄 How Botium Sends Messages

**Step-by-step process:**

1. **Start Chrome Browser** (headless mode)
   ```
   Chrome opens → No visible window
   ```

2. **Navigate to WhatsApp Web**
   ```
   Goes to: https://web.whatsapp.com
   ```

3. **Wait for QR Code or Session**
   ```
   If first time: Need to scan QR code
   If session exists: Loads automatically
   ```

4. **Find Your Bot Chat**
   ```
   Looks for: "#main" element (chat container)
   ```

5. **Type Message**
   ```
   Finds input: div[contenteditable='true'][data-tab='1']
   Types: "תזכיר לי לקנות חלב"
   ```

6. **Click Send Button**
   ```
   Finds button: span[data-icon='send']
   Clicks it
   ```

7. **Wait for Response**
   ```
   Reads: Last message in chat
   Bot should respond: "תזכורת נקבעה"
   ```

8. **Check Expected Text**
   ```
   If response contains "תזכורת נקבעה" → ✅ PASS
   If response contains "error" → ❌ FAIL
   ```

9. **Repeat for Next Message**
   ```
   If more #me/#bot pairs → continue
   ```

---

## 📊 Summary of All Messages

| Test File | Total Messages | Purpose |
|-----------|----------------|---------|
| bug02-context-loss | 2 messages | Test context preservation |
| bug03-multiline | 1 multi-line | Test multi-line parsing |
| bug08-reminder | 2 messages | Test reminder detection |
| bug09-date-year | 2 messages | Test date inference |
| bug13-time | 1 message | Test time extraction |
| bug14-search | 2 messages | Test search tokenization |
| bug15-notes | 1 message | Test notes extraction |
| bug16-list-all | 3 messages | Test meta-phrase handling |
| hebrew-names | 2 messages | Test participant parsing |
| search-tokenization | 4 messages | Test Hebrew search |

**Total: 20 messages sent across 10 test files**

---

## 🎯 Simple Answer

**What messages does Botium send?**

Botium sends **exactly the same messages a real user would type in WhatsApp:**

- ✅ `תזכיר לי לקנות חלב מחר`
- ✅ `פגישה עם יהודית`
- ✅ `כל האירועים שלי`
- ✅ `תקבע אירוע 1.11 בשעה 13:00`
- ✅ `מתי יקיר`

**How it sends them:**

1. Opens WhatsApp Web in Chrome
2. Types the message
3. Clicks send button
4. Reads bot's response
5. Checks if response is correct

**It's exactly like a human testing your bot manually, but automated!**

---

## 🔍 Want to See It In Action?

**Run in non-headless mode (see the browser):**

1. Edit `botium.json`:
```json
"chromeOptions": {
  "args": ["--disable-gpu", "--no-sandbox"]
  // Remove "--headless" to see browser
}
```

2. Run test:
```bash
npm run test:conversations
```

3. Watch Chrome open, type messages, and check responses!

---

## ⚠️ Important Note

**For this to work, you need:**
- ✅ Bot running locally OR on server
- ✅ WhatsApp Web session logged in
- ✅ Bot phone number added to your contacts

**Alternative: Direct API Testing (No WhatsApp Web)**

If you want to test without WhatsApp Web, you can:
1. Use Message Simulator instead (`npm run test:simulator`)
2. Send HTTP requests to your bot's API
3. Test individual functions with Jest (`npm test`)

Those don't require WhatsApp Web session!
