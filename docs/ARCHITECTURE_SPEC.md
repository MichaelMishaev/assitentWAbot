# WhatsApp Assistant Bot - Architecture & Deployment Specification

## 1. Baileys Deployment Models - DETAILED ANALYSIS

### Option A: Single Shared Instance (Recommended for MVP)
```
┌─────────────────────────────────────────┐
│  One Baileys Process                    │
│  ├─ Session Manager                     │
│  │  ├─ User 972XXXXXXX1 (session)      │
│  │  ├─ User 972XXXXXXX2 (session)      │
│  │  └─ User 972XXXXXXX3 (session)      │
│  └─ Message Router                      │
└─────────────────────────────────────────┘
```

**How it works:**
- One Node.js process runs Baileys
- Each user = separate session (auth credentials stored per user)
- All sessions maintained in memory + persisted to DB/file
- Single event loop handles all incoming messages

**Pros:**
- ✅ Simple to implement
- ✅ Low resource usage (1 process)
- ✅ Easy state management
- ✅ Works for MVP (up to ~50 concurrent users)

**Cons:**
- ❌ Single point of failure
- ❌ Doesn't scale horizontally
- ❌ One session crash can affect others
- ❌ Memory grows with user count

**Implementation:**
```typescript
// sessionManager.ts
class SessionManager {
  private sessions: Map<string, WASocket> = new Map();

  async initSession(userId: string, phone: string) {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${userId}`);
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false
    });

    this.sessions.set(userId, sock);
    return sock;
  }

  getSession(userId: string): WASocket | undefined {
    return this.sessions.get(userId);
  }
}
```

**Scaling limit:** 50-100 users per instance

---

### Option B: Instance Pool with Load Balancing (Recommended for Scale)
```
┌─────────────┐
│  Load       │
│  Balancer   │
└──────┬──────┘
       │
   ┌───┴────┬─────────┬─────────┐
   ↓        ↓         ↓         ↓
┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐
│ B-1 │  │ B-2 │  │ B-3 │  │ B-4 │
│ 50  │  │ 50  │  │ 50  │  │ 50  │
│users│  │users│  │users│  │users│
└─────┘  └─────┘  └─────┘  └─────┘
```

**How it works:**
- Multiple Baileys processes (workers)
- Load balancer routes messages based on userId hash
- Each worker handles subset of users
- Redis tracks which worker owns which session

**Pros:**
- ✅ Horizontal scaling (add more workers)
- ✅ Fault isolation (one worker crash ≠ all users down)
- ✅ Can scale to 1000s of users
- ✅ Rolling restarts possible

**Cons:**
- ❌ Complex session routing
- ❌ Redis dependency for coordination
- ❌ Worker crashes require session migration
- ❌ Overhead from load balancing

**Implementation:**
```typescript
// loadBalancer.ts
class BaileysLoadBalancer {
  private workers: WorkerProcess[] = [];
  private sessionMap = new Redis(); // userId -> workerId

  async routeMessage(userId: string, message: any) {
    const workerId = await this.sessionMap.get(`session:${userId}`);

    if (!workerId) {
      // Assign to least-loaded worker
      const worker = this.getLeastLoadedWorker();
      await this.sessionMap.set(`session:${userId}`, worker.id);
      return worker.send(message);
    }

    const worker = this.workers.find(w => w.id === workerId);
    return worker.send(message);
  }

  getLeastLoadedWorker(): WorkerProcess {
    return this.workers.reduce((min, w) =>
      w.sessionCount < min.sessionCount ? w : min
    );
  }
}
```

**Scaling limit:** 500-1000 users per worker, unlimited workers

---

### Option C: One Instance Per User (NOT Recommended)
```
User 1 → Baileys-1
User 2 → Baileys-2
User 3 → Baileys-3
...
User N → Baileys-N
```

**Pros:**
- ✅ Perfect isolation
- ✅ One crash = only 1 user affected

**Cons:**
- ❌ Massive resource waste (each process = ~50MB RAM)
- ❌ Complex orchestration (Docker/K8s required)
- ❌ Slow startup (QR code per user)
- ❌ Doesn't scale economically

**Verdict:** ⛔ **Do NOT use** for this project

---

### Recommended Path:
- **MVP (0-100 users):** Option A (Single Instance)
- **Scale (100-1K users):** Option B (Pool with 2-5 workers)
- **Enterprise (1K+ users):** Migrate to WhatsApp Business API

---

## 2. Authentication Flow Specification

### Challenge: No traditional login UI in WhatsApp

### Solution: QR Code + PIN-based authentication

```
┌──────────────────────────────────────────────┐
│  First Time User Registration                │
└──────────────────────────────────────────────┘

1. User sends: "היי" or "/start" to bot number
2. Bot checks: Phone number exists in DB?

   NO → Registration flow:
   ┌─────────────────────────────────────────┐
   │ Bot: "ברוך הבא! בוא נרשום אותך:"        │
   │      1. מה השם שלך?                     │
   └─────────────────────────────────────────┘
   User: "מיכאל"

   ┌─────────────────────────────────────────┐
   │ Bot: "נעים מאוד מיכאל! בחר קוד PIN בן   │
   │      4 ספרות לאבטחת החשבון (לדוגמה: 1234)"│
   └─────────────────────────────────────────┘
   User: "5678"

   ┌─────────────────────────────────────────┐
   │ Bot: "מעולה! החשבון שלך נוצר ✅"        │
   │      "מעכשיו תוכל להשתמש בתפריט הראשי"  │
   │      [Shows main menu]                  │
   └─────────────────────────────────────────┘

   YES → Login verification:
   ┌─────────────────────────────────────────┐
   │ Bot: "שלום מיכאל! נא הזן את קוד ה-PIN"  │
   └─────────────────────────────────────────┘
   User: "5678"

   ┌─────────────────────────────────────────┐
   │ Bot: "נכנסת בהצלחה! ✅"                 │
   │      [Shows main menu]                  │
   └─────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Security Features                           │
└──────────────────────────────────────────────┘

- PIN stored as bcrypt hash
- 3 failed attempts → 5 minute lockout
- Phone number = primary identifier (WhatsApp verified)
- Session expires after 30 days of inactivity
- /logout command clears session
```

### Implementation:
```typescript
// authService.ts
interface AuthState {
  userId: string | null;
  phone: string;
  authenticated: boolean;
  failedAttempts: number;
  lockoutUntil: Date | null;
  registrationStep?: 'name' | 'pin' | 'complete';
  tempData?: { name?: string };
}

class AuthService {
  async handleMessage(phone: string, message: string): Promise<string> {
    const state = await this.getAuthState(phone);

    // Check lockout
    if (state.lockoutUntil && state.lockoutUntil > new Date()) {
      const minutes = Math.ceil((state.lockoutUntil.getTime() - Date.now()) / 60000);
      return `חשבון נעול. נסה שוב בעוד ${minutes} דקות`;
    }

    // Already authenticated
    if (state.authenticated) {
      return this.handleCommand(state.userId!, message);
    }

    // Registration flow
    if (state.registrationStep) {
      return this.handleRegistration(phone, message, state);
    }

    // Check if user exists
    const user = await this.db.getUserByPhone(phone);
    if (!user) {
      return this.startRegistration(phone);
    }

    // Login flow
    return this.handleLogin(phone, message, user);
  }

  async handleLogin(phone: string, pin: string, user: User): Promise<string> {
    const valid = await bcrypt.compare(pin, user.passwordHash);

    if (valid) {
      await this.setAuthenticated(phone, user.id);
      return `שלום ${user.name}! נכנסת בהצלחה ✅\n\n${this.getMainMenu()}`;
    }

    // Failed attempt
    const state = await this.incrementFailedAttempts(phone);
    if (state.failedAttempts >= 3) {
      await this.lockAccount(phone, 5); // 5 minutes
      return 'קוד שגוי 3 פעמים. חשבון נעול ל-5 דקות.';
    }

    return `קוד שגוי. נסה שוב (${3 - state.failedAttempts} ניסיונות נותרו)`;
  }
}
```

---

## 3. WhatsApp Business API Migration Plan

### Why Migrate?
- ✅ Official API (no ban risk)
- ✅ Better reliability
- ✅ Official support
- ✅ More features (buttons, lists, templates)
- ❌ Costs money (~$0.005-0.10 per message)
- ❌ Approval process required

### Migration Strategy: Provider Abstraction Pattern

```typescript
// providers/IMessageProvider.ts
interface IMessageProvider {
  sendMessage(to: string, text: string): Promise<void>;
  sendMenu(to: string, menu: MenuStructure): Promise<void>;
  onMessage(callback: (from: string, text: string) => void): void;
  initialize(): Promise<void>;
  disconnect(): Promise<void>;
}

// providers/BaileysProvider.ts
class BaileysProvider implements IMessageProvider {
  private sock: WASocket;

  async sendMessage(to: string, text: string) {
    await this.sock.sendMessage(to, { text });
  }

  onMessage(callback: (from: string, text: string) => void) {
    this.sock.ev.on('messages.upsert', ({ messages }) => {
      const msg = messages[0];
      callback(msg.key.remoteJid!, msg.message?.conversation || '');
    });
  }
}

// providers/WhatsAppBusinessProvider.ts
class WhatsAppBusinessProvider implements IMessageProvider {
  private apiKey: string;

  async sendMessage(to: string, text: string) {
    await axios.post('https://graph.facebook.com/v18.0/messages', {
      messaging_product: 'whatsapp',
      to,
      text: { body: text }
    }, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
  }

  onMessage(callback: (from: string, text: string) => void) {
    // Webhook-based (express endpoint)
    this.webhookHandler = callback;
  }
}

// factory.ts
function createMessageProvider(): IMessageProvider {
  const provider = process.env.MESSAGE_PROVIDER || 'baileys';

  switch (provider) {
    case 'baileys':
      return new BaileysProvider();
    case 'whatsapp-business':
      return new WhatsAppBusinessProvider();
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

### Migration Steps:

#### Phase 1: Abstraction (Week 1-2)
- [ ] Create IMessageProvider interface
- [ ] Wrap all Baileys calls in BaileysProvider
- [ ] Test everything still works
- [ ] Add provider selection via env var

#### Phase 2: Parallel Implementation (Week 3-4)
- [ ] Apply for WhatsApp Business API access
- [ ] Implement WhatsAppBusinessProvider
- [ ] Create webhook endpoint for incoming messages
- [ ] Test with shadow mode (send to both, but only read from Baileys)

#### Phase 3: Gradual Rollout (Week 5-6)
- [ ] Enable for 10% of users (feature flag)
- [ ] Monitor error rates, delivery times
- [ ] Gradually increase to 50%, 100%
- [ ] Keep Baileys as fallback for 2 weeks

#### Phase 4: Full Migration (Week 7)
- [ ] Switch all users to WhatsApp Business API
- [ ] Archive Baileys code (don't delete yet)
- [ ] Monitor for 1 week
- [ ] Remove Baileys dependency

### Rollback Plan:
```bash
# Emergency rollback
export MESSAGE_PROVIDER=baileys
pm2 restart whatsapp-bot

# Gradual rollback
redis-cli SET feature:whatsapp_business_rollout 0
```

---

## 4. Error Recovery & State Management

### The Problem:
```
User: "2" (add event)
Bot: "מה השם של האירוע?"
User: "פגישה עם דני"
Bot: "מתי? (DD/MM/YYYY HH:MM)"
User: [Goes to lunch, doesn't respond]
??? What happens after 1 hour? 1 day?
```

### Solution: Redis-based State Machine with Timeouts

```typescript
// stateManager.ts
enum ConversationState {
  IDLE = 'IDLE',
  MAIN_MENU = 'MAIN_MENU',
  ADDING_EVENT_NAME = 'ADDING_EVENT_NAME',
  ADDING_EVENT_DATE = 'ADDING_EVENT_DATE',
  ADDING_EVENT_TIME = 'ADDING_EVENT_TIME',
  ADDING_EVENT_CONFIRM = 'ADDING_EVENT_CONFIRM',
  ADDING_REMINDER = 'ADDING_REMINDER',
  // ... more states
}

interface UserSession {
  state: ConversationState;
  context: any; // Partial data being collected
  lastActivity: number; // timestamp
  timeout: number; // seconds
}

class StateManager {
  private redis: Redis;
  private readonly SESSION_PREFIX = 'session:';
  private readonly DEFAULT_TIMEOUT = 300; // 5 minutes

  async setState(userId: string, state: ConversationState, context: any = {}) {
    const session: UserSession = {
      state,
      context,
      lastActivity: Date.now(),
      timeout: this.getTimeoutForState(state)
    };

    await this.redis.setex(
      `${this.SESSION_PREFIX}${userId}`,
      session.timeout,
      JSON.stringify(session)
    );
  }

  async getState(userId: string): Promise<UserSession | null> {
    const data = await this.redis.get(`${this.SESSION_PREFIX}${userId}`);
    if (!data) return null;

    const session = JSON.parse(data);

    // Check if timed out
    const elapsed = (Date.now() - session.lastActivity) / 1000;
    if (elapsed > session.timeout) {
      await this.handleTimeout(userId, session);
      return null;
    }

    return session;
  }

  async handleTimeout(userId: string, session: UserSession) {
    await this.clearState(userId);

    // Send timeout message
    const provider = getMessageProvider();
    await provider.sendMessage(
      userId,
      'הזמן המוקצב עבר. אפשר להתחיל מחדש עם /תפריט'
    );

    // Log for analytics
    logger.info('Session timeout', { userId, state: session.state });
  }

  getTimeoutForState(state: ConversationState): number {
    const timeouts = {
      [ConversationState.IDLE]: 86400, // 24 hours
      [ConversationState.MAIN_MENU]: 300, // 5 minutes
      [ConversationState.ADDING_EVENT_NAME]: 180, // 3 minutes
      [ConversationState.ADDING_EVENT_DATE]: 180,
      [ConversationState.ADDING_EVENT_CONFIRM]: 60, // 1 minute
    };

    return timeouts[state] || this.DEFAULT_TIMEOUT;
  }

  async clearState(userId: string) {
    await this.redis.del(`${this.SESSION_PREFIX}${userId}`);
  }
}
```

### State Transition Flow:

```
IDLE
  ↓ (user sends message)
MAIN_MENU [5min timeout]
  ↓ (user selects "2")
ADDING_EVENT_NAME [3min timeout]
  ↓ (user enters name)
ADDING_EVENT_DATE [3min timeout]
  ↓ (user enters date)
ADDING_EVENT_TIME [3min timeout]
  ↓ (user enters time)
ADDING_EVENT_CONFIRM [1min timeout]
  ↓ (user confirms)
[Save to DB] → MAIN_MENU
  ↓ (5min of no activity)
IDLE

At any point:
- Timeout → IDLE + notification
- /ביטול → Previous state (undo)
- /תפריט → MAIN_MENU (abandon current)
```

### Graceful Error Messages:

```typescript
const ERROR_MESSAGES = {
  HE: {
    TIMEOUT: 'הזמן המוקצב עבר. ההזנה לא נשמרה. רוצה להתחיל מחדש?',
    INVALID_INPUT: 'קלט לא תקין. נסה שוב או שלח /עזרה',
    SYSTEM_ERROR: 'אופס! משהו השתבש. ננסה שוב בעוד רגע.',
    CANCEL: 'בוטל. חוזרים לתפריט ראשי.',
  }
};
```

---

## 5. Rate Limiting Strategy

### Risk: WhatsApp bans for spam behavior

### What triggers bans:
- ❌ >100 messages/hour to unknown contacts
- ❌ >20 messages/minute burst
- ❌ High block rate (>50% of recipients block you)
- ❌ Sending same message to many people
- ❌ User reports you as spam

### Multi-Layer Rate Limiting:

#### Layer 1: Per-User Outbound Limiting
```typescript
// rateLimiter.ts
class RateLimiter {
  private redis: Redis;

  async checkOutboundLimit(userId: string): Promise<boolean> {
    const key = `ratelimit:outbound:${userId}`;

    // Sliding window: max 20 messages per minute
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute ago

    // Remove old entries
    await this.redis.zremrangebyscore(key, 0, windowStart);

    // Count messages in window
    const count = await this.redis.zcard(key);

    if (count >= 20) {
      logger.warn('Rate limit exceeded', { userId, count });
      return false; // Blocked
    }

    // Add current message
    await this.redis.zadd(key, now, `${now}-${Math.random()}`);
    await this.redis.expire(key, 60); // Cleanup

    return true; // Allowed
  }

  async checkInboundLimit(phone: string): Promise<boolean> {
    // Protect against user spamming us
    const key = `ratelimit:inbound:${phone}`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, 60); // 1 minute window
    }

    if (count > 30) {
      // User sending >30 messages/min
      await this.tempBan(phone, 300); // 5 minute ban
      return false;
    }

    return true;
  }

  async tempBan(phone: string, seconds: number) {
    await this.redis.setex(`ban:${phone}`, seconds, '1');

    const provider = getMessageProvider();
    await provider.sendMessage(
      phone,
      'זיהינו פעילות חריגה. נסה שוב בעוד 5 דקות.'
    );
  }
}
```

#### Layer 2: Global Rate Limiting
```typescript
class GlobalRateLimiter {
  // Limit total messages from bot (to avoid WhatsApp ban)
  async checkGlobalLimit(): Promise<boolean> {
    const key = 'ratelimit:global';
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, 3600); // 1 hour window
    }

    if (count > 5000) { // Max 5k messages/hour globally
      logger.error('Global rate limit exceeded', { count });
      return false;
    }

    return true;
  }
}
```

#### Layer 3: Adaptive Throttling
```typescript
class AdaptiveThrottler {
  // Slow down if we detect issues
  private throttleLevel = 0; // 0 = normal, 1-5 = increasing delay

  async beforeSend(userId: string) {
    if (this.throttleLevel > 0) {
      const delay = this.throttleLevel * 1000; // 1s per level
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  increaseThrottle() {
    this.throttleLevel = Math.min(this.throttleLevel + 1, 5);
    logger.warn('Increased throttle', { level: this.throttleLevel });
  }

  decreaseThrottle() {
    this.throttleLevel = Math.max(this.throttleLevel - 1, 0);
  }

  async monitorHealth() {
    // If we start getting disconnects or errors, slow down
    setInterval(async () => {
      const errorRate = await this.getRecentErrorRate();

      if (errorRate > 0.1) { // >10% errors
        this.increaseThrottle();
      } else if (errorRate < 0.01 && this.throttleLevel > 0) {
        this.decreaseThrottle();
      }
    }, 60000); // Check every minute
  }
}
```

#### Layer 4: Quality Score Tracking
```typescript
// Track user satisfaction to avoid high block rate
interface QualityMetrics {
  messagesSent: number;
  messagesRead: number;
  blockedByUser: boolean;
  lastInteraction: Date;
}

class QualityTracker {
  async trackInteraction(userId: string, type: 'sent' | 'read' | 'blocked') {
    const metrics = await this.getMetrics(userId);

    switch (type) {
      case 'sent':
        metrics.messagesSent++;
        break;
      case 'read':
        metrics.messagesRead++;
        break;
      case 'blocked':
        metrics.blockedByUser = true;
        await this.handleBlock(userId);
        break;
    }

    await this.saveMetrics(userId, metrics);
  }

  async getReadRate(): Promise<number> {
    // Global read rate (how many messages are actually read)
    const allMetrics = await this.getAllMetrics();
    const totalSent = allMetrics.reduce((sum, m) => sum + m.messagesSent, 0);
    const totalRead = allMetrics.reduce((sum, m) => sum + m.messagesRead, 0);

    return totalRead / totalSent;
  }

  async handleBlock(userId: string) {
    // User blocked us - stop sending immediately
    await this.redis.set(`blocked:${userId}`, '1');
    logger.error('User blocked bot', { userId });

    // Alert admin if block rate > 5%
    const blockRate = await this.getBlockRate();
    if (blockRate > 0.05) {
      await this.alertAdmin(`High block rate: ${(blockRate * 100).toFixed(2)}%`);
    }
  }
}
```

### Implementation Summary:

| Layer | Purpose | Limit | Action on Exceed |
|-------|---------|-------|------------------|
| Per-user outbound | Prevent user spam | 20 msg/min | Queue message |
| Per-user inbound | Prevent bot abuse | 30 msg/min | Temp ban 5min |
| Global | Protect WhatsApp ban | 5k msg/hour | Pause all sends |
| Adaptive | React to issues | Dynamic | Add delays |
| Quality | Track satisfaction | <5% block rate | Alert admin |

---

## 6. Additional Features from Research

Based on research of similar bots and WhatsApp best practices:

### Priority 1 (Add to MVP):
- ✅ **Quick reply buttons** (Baileys supports this)
  ```typescript
  await sock.sendMessage(jid, {
    text: 'בחר אפשרות:',
    buttons: [
      {buttonId: '1', buttonText: {displayText: '📅 האירועים שלי'}},
      {buttonId: '2', buttonText: {displayText: '➕ הוסף אירוע'}},
    ],
    headerType: 1
  });
  ```

- ✅ **List messages** (better than numbered text menu)
  ```typescript
  await sock.sendMessage(jid, {
    text: 'תפריט ראשי',
    sections: [{
      title: 'ניהול יומן',
      rows: [
        {title: 'האירועים שלי', rowId: 'events', description: 'צפייה ביומן'},
        {title: 'הוסף אירוע', rowId: 'add_event', description: 'תזמן אירוע חדש'}
      ]
    }]
  });
  ```

- ✅ **Voice message transcription** (OpenAI Whisper API)
  - User sends voice note → auto-transcribe → process as text

- ✅ **/ביטול (cancel) command** at any stage

- ✅ **Confirmation before sending messages**
  ```
  User: "שלח לדני 'שלום מה קורה?'"
  Bot: "אשלח לדני:
       'שלום מה קורה?'

       אישור? (כן/לא)"
  User: "כן"
  Bot: "נשלח! ✅"
  ```

### Priority 2 (Phase 2):
- ⚡ **Smart scheduling conflicts**
  ```
  User: "פגישה עם שרה ביום שני 14:00"
  Bot: "⚠️ יש לך פגישה אחרת 14:00-15:00 (דני)
       לתזמן בכל זאת?"
  ```

- ⚡ **Location-based reminders** (when WhatsApp adds location webhook)
  - "תזכר לי לקנות חלב כשאני קרוב לסופר"

- ⚡ **Recurring event templates**
  ```
  User: "כל יום שני 10:00 - ישיבת צוות"
  → Bot creates template, applies automatically
  ```

- ⚡ **Smart time parsing**
  ```
  "מחר בבוקר" → Tomorrow 9:00
  "בערב" → Today 19:00
  "בסופש" → Next Saturday 10:00
  ```

### Priority 3 (Phase 3):
- 🔮 **AI-powered suggestions**
  - "נראה שאתה נפגש עם דני כל שבוע. לקבוע אירוע חוזר?"

- 🔮 **Group event coordination**
  - Create event → Bot asks "למי להזמין?"
  - Sends invites to contacts → tracks RSVPs

- 🔮 **Integration with calendar images**
  - User forwards screenshot of event → AI extracts details

- 🔮 **Smart reminders based on travel time**
  - If event has location, remind 30min early + "יש 15 דק' נסיעה"

---

## 7. COMPREHENSIVE DEVELOPMENT PLAN

### Phase 0: Foundation (Week 1-2)
```
INFRASTRUCTURE SETUP
├─ [ ] Setup Postgres DB (Supabase)
│  ├─ [ ] Create schema (users, events, reminders, contacts)
│  ├─ [ ] Add indexes (user_id, phone, start_ts_utc)
│  └─ [ ] Setup migrations (node-pg-migrate)
│
├─ [ ] Setup Redis
│  ├─ [ ] Install & configure
│  ├─ [ ] Test connection
│  └─ [ ] Setup persistence (RDB + AOF)
│
├─ [ ] Setup BullMQ
│  ├─ [ ] Create queues (reminders, recurrence)
│  ├─ [ ] Setup workers
│  └─ [ ] Add retry logic
│
├─ [ ] Baileys Integration (Option A: Single Instance)
│  ├─ [ ] Initialize Baileys client
│  ├─ [ ] Multi-session management
│  ├─ [ ] QR code handling (send via WhatsApp or web UI)
│  └─ [ ] Auto-reconnect logic
│
└─ [ ] Project Structure
   ├─ [ ] TypeScript setup
   ├─ [ ] Environment variables (.env)
   ├─ [ ] Logger (Winston)
   └─ [ ] Error handling middleware
```

### Phase 1: Core Authentication & State (Week 3-4)
```
AUTH SYSTEM
├─ [ ] Implement StateManager (Redis-based)
│  ├─ [ ] State transitions
│  ├─ [ ] Timeout handling
│  └─ [ ] Session cleanup
│
├─ [ ] Authentication Flow
│  ├─ [ ] Registration (name + PIN)
│  ├─ [ ] Login (PIN verification)
│  ├─ [ ] Failed attempt tracking
│  ├─ [ ] Account lockout (3 strikes)
│  └─ [ ] /logout command
│
└─ [ ] Rate Limiting
   ├─ [ ] Per-user inbound (30/min)
   ├─ [ ] Per-user outbound (20/min)
   ├─ [ ] Global limit (5k/hour)
   └─ [ ] Quality tracking
```

### Phase 2: Menu System (Week 5)
```
MAIN MENU & NAVIGATION
├─ [ ] Hebrew menu structure
│  ├─ [ ] Main menu (8 options)
│  ├─ [ ] Submenus for each feature
│  └─ [ ] /תפריט command (back to main)
│
├─ [ ] List Message UI (better than text)
│  ├─ [ ] Implement Baileys list messages
│  └─ [ ] Fallback to numbered text
│
└─ [ ] Commands
   ├─ [ ] /תפריט - main menu
   ├─ [ ] /ביטול - cancel operation
   ├─ [ ] /עזרה - help
   └─ [ ] /התנתק - logout
```

### Phase 3: Events CRUD (Week 6-7)
```
EVENT MANAGEMENT
├─ [ ] Create Event Flow
│  ├─ [ ] State: collect title
│  ├─ [ ] State: collect date (DD/MM/YYYY)
│  ├─ [ ] State: collect time (HH:MM)
│  ├─ [ ] State: optional location
│  ├─ [ ] State: confirmation
│  └─ [ ] Save to DB
│
├─ [ ] List Events
│  ├─ [ ] "היום" (today)
│  ├─ [ ] "מחר" (tomorrow)
│  ├─ [ ] "השבוע" (this week)
│  ├─ [ ] "הכל" (all upcoming)
│  └─ [ ] Format output nicely
│
├─ [ ] Delete Event
│  ├─ [ ] Show list of events (numbered)
│  ├─ [ ] User selects number
│  ├─ [ ] Confirmation prompt
│  └─ [ ] Delete from DB
│
└─ [ ] LocalCalendarProvider
   ├─ [ ] Interface implementation
   ├─ [ ] CRUD operations
   └─ [ ] Timezone handling (UTC ↔ user TZ)
```

### Phase 4: Reminders System (Week 8-9)
```
REMINDERS & SCHEDULING
├─ [ ] Create Reminder Flow
│  ├─ [ ] Collect title
│  ├─ [ ] Collect date/time
│  ├─ [ ] Optional: link to event
│  ├─ [ ] Optional: recurrence (weekly)
│  └─ [ ] Save to DB
│
├─ [ ] BullMQ Integration
│  ├─ [ ] Schedule one-time reminder job
│  ├─ [ ] Schedule recurring reminder job
│  ├─ [ ] Job idempotency
│  └─ [ ] Retry logic (3 attempts)
│
├─ [ ] Reminder Worker
│  ├─ [ ] Process job when due
│  ├─ [ ] Send WhatsApp message
│  ├─ [ ] Handle failures (log & alert)
│  └─ [ ] Update status in DB
│
└─ [ ] List Reminders
   ├─ [ ] Active reminders
   ├─ [ ] Past reminders (last 7 days)
   └─ [ ] Cancel reminder option
```

### Phase 5: Contacts & Settings (Week 10)
```
CONTACTS
├─ [ ] Add Contact
│  ├─ [ ] Name
│  ├─ [ ] Relation (family/friend/work)
│  ├─ [ ] Aliases (דני, דניאל, Daniel)
│  └─ [ ] Save to DB
│
├─ [ ] List Contacts
└─ [ ] Delete Contact

SETTINGS
├─ [ ] Language (HE/EN)
│  ├─ [ ] Switch locale
│  └─ [ ] Apply to all messages
│
├─ [ ] Timezone
│  ├─ [ ] List common zones
│  └─ [ ] Update user prefs
│
```

### Phase 6: Draft Messages (Week 11)
```
MESSAGE DRAFTING
├─ [ ] Draft Flow
│  ├─ [ ] "למי לשלוח?"
│  ├─ [ ] Select from contacts
│  ├─ [ ] "מה לכתוב?"
│  ├─ [ ] User types message
│  ├─ [ ] Show preview
│  ├─ [ ] Confirmation
│  └─ [ ] Send or schedule
│
└─ [ ] Scheduled Messages
   ├─ [ ] "מתי לשלוח?"
   ├─ [ ] Schedule BullMQ job
   └─ [ ] Send at specified time
```

### Phase 7: Polish & Testing (Week 12-13)
```
POLISH
├─ [ ] Error messages in Hebrew
├─ [ ] Help text with examples
├─ [ ] Emoji in menus (📅⏰✅)
└─ [ ] Loading indicators ("מעבד...")

TESTING
├─ [ ] Unit tests (services, parsers)
├─ [ ] Integration tests (state machine)
├─ [ ] Manual testing (full flows)
└─ [ ] Load testing (50 users)

MONITORING
├─ [ ] Winston logging
├─ [ ] Error tracking (Sentry)
├─ [ ] Metrics (events/min, reminders sent)
└─ [ ] Health check endpoint
```

### Phase 8: Deployment (Week 14)
```
DEPLOYMENT
├─ [ ] Environment setup (VPS/DigitalOcean)
├─ [ ] Docker compose (app + Redis + Postgres)
├─ [ ] PM2 process manager
├─ [ ] Nginx reverse proxy
├─ [ ] SSL certificate
├─ [ ] Backup strategy (DB dumps)
└─ [ ] Monitoring dashboard
```

### Phase 9 (Optional): WhatsApp Business API Migration (Week 15-18)
```
MIGRATION PREP
├─ [ ] Apply for WhatsApp Business API
├─ [ ] Create IMessageProvider interface
├─ [ ] Refactor to use provider pattern
├─ [ ] Implement WhatsAppBusinessProvider
├─ [ ] Shadow mode testing
└─ [ ] Gradual rollout (10% → 100%)
```

---

## 8. Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Deployment Model** | Single Instance (MVP) → Pool (Scale) | Simple start, clear growth path |
| **Authentication** | Phone + PIN | No email, WhatsApp-native |
| **State Management** | Redis sessions with timeouts | Fast, reliable, auto-cleanup |
| **Rate Limiting** | Multi-layer (user, global, adaptive) | Avoid WhatsApp bans |
| **Calendar Storage** | Local DB (Postgres) | Fast, offline-capable |
| **Scheduler** | BullMQ | Proven, retries, recurring jobs |
| **Message Provider** | Baileys (MVP) → Business API (later) | Fast MVP, official later |
| **Menu UI** | List messages > Numbered text | Better UX, cleaner |
| **Language** | Hebrew first | Target market underserved |

---

## 9. Risk Mitigation Checklist

- [x] **Baileys ban risk** → Provider abstraction + migration plan
- [x] **Rate limiting** → Multi-layer protection
- [x] **State loss** → Redis persistence + timeout handling
- [x] **Scaling** → Clear path from single → pool → Business API
- [x] **Authentication** → PIN + lockout + session management
- [x] **Hebrew complexity** → Clarification prompts + examples
- [x] **Timezone bugs** → All UTC in DB, tested conversions
- [x] **Reminder delivery** → BullMQ retries + monitoring

---

## 10. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **MVP Completion** | 14 weeks | Project timeline |
| **User Registration Success** | >95% | Logs: successful registrations / attempts |
| **Message Response Time** | <2s | Logs: timestamp received → timestamp sent |
| **Reminder Accuracy** | >99% | Sent on time (±2 min) / total scheduled |
| **Error Rate** | <1% | Failed operations / total operations |
| **Session Timeout Rate** | <10% | Timeouts / total sessions |
| **User Retention (30d)** | >35% | Active users day 30 / registered users |

---

## Next Steps

1. **Review this spec** with team/stakeholders
2. **Setup dev environment** (Node.js, Postgres, Redis)
3. **Create GitHub repo** with project structure
4. **Start Phase 0** (Infrastructure setup)
5. **Daily standups** to track progress

---

**Document Version:** 1.0
**Last Updated:** 2025-10-01
**Status:** Ready for Implementation ✅
