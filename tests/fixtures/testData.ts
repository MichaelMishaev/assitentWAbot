// Test data fixtures for comprehensive testing

export const testUsers = {
  hebrewUser: {
    phone: '+972555030001',
    name: 'מייק טסט',
    password: '1234',
    timezone: 'Asia/Jerusalem',
    locale: 'he',
  },
  englishUser: {
    phone: '+1234567890',
    name: 'John Test',
    password: '5678',
    timezone: 'America/New_York',
    locale: 'en',
  },
  multiEventUser: {
    phone: '+972555030002',
    name: 'משה כהן',
    password: '0000',
    timezone: 'Asia/Jerusalem',
    locale: 'he',
  },
};

export const testEvents = {
  simpleMeeting: {
    title: 'פגישה חשובה',
    startTsUtc: new Date('2025-01-15T10:00:00Z'),
    location: 'תל אביב',
  },
  allDayEvent: {
    title: 'יום הולדת',
    startTsUtc: new Date('2025-01-20T00:00:00Z'),
    endTsUtc: new Date('2025-01-20T23:59:59Z'),
  },
  recurringMeeting: {
    title: 'ישיבת צוות',
    startTsUtc: new Date('2025-01-15T09:00:00Z'),
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
  },
  longTitle: {
    title: 'אירוע עם כותרת ארוכה מאוד שמכילה הרבה מידע על המפגש הקרוב',
    startTsUtc: new Date('2025-01-18T14:00:00Z'),
  },
  withEmoji: {
    title: '🎉 מסיבת סיום 🎂',
    startTsUtc: new Date('2025-01-25T20:00:00Z'),
    location: 'בית',
  },
  sqlInjection: {
    title: "'; DROP TABLE events; --",
    startTsUtc: new Date('2025-01-30T12:00:00Z'),
  },
};

export const testReminders = {
  simple: {
    title: 'קנה חלב',
    dueTsUtc: new Date(Date.now() + 3600000), // 1 hour from now
  },
  weekly: {
    title: 'שיעור יוגה',
    dueTsUtc: new Date('2025-01-15T08:00:00Z'),
    rrule: 'FREQ=WEEKLY;BYDAY=TU,TH',
  },
  urgent: {
    title: 'התקשר לרופא - דחוף!',
    dueTsUtc: new Date(Date.now() + 600000), // 10 minutes from now
  },
  far: {
    title: 'חידוש ביטוח',
    dueTsUtc: new Date('2025-06-01T09:00:00Z'),
  },
};

export const testContacts = {
  friend: {
    name: 'דני',
    relation: 'חבר',
    aliases: ['דניאל', 'דן'],
  },
  family: {
    name: 'אמא',
    relation: 'משפחה',
    aliases: ['אימא', 'מרים'],
  },
  colleague: {
    name: 'יוסי',
    relation: 'עבודה',
    aliases: ['יוסף'],
  },
  noAlias: {
    name: 'רחל',
    relation: 'שכנה',
    aliases: [],
  },
};

export const nlpTestCases = [
  {
    input: 'קבע פגישה עם דני מחר ב-3',
    expectedIntent: 'create_event',
    expectedEntities: {
      title: 'פגישה עם דני',
      contactName: 'דני',
    },
    minConfidence: 0.85,
  },
  {
    input: 'תזכיר לי להתקשר לאמא ביום רביעי בבוקר',
    expectedIntent: 'create_reminder',
    expectedEntities: {
      title: 'התקשר לאמא',
    },
    minConfidence: 0.8,
  },
  {
    input: 'מה יש לי מחר?',
    expectedIntent: 'search_event',
    minConfidence: 0.9,
  },
  {
    input: 'שלח לדני שאני אאחר',
    expectedIntent: 'send_message',
    expectedEntities: {
      recipient: 'דני',
      content: 'אני אאחר',
    },
    minConfidence: 0.8,
  },
  {
    input: 'קבע משהו',
    expectedIntent: 'unknown',
    maxConfidence: 0.5,
    expectClarification: true,
  },
  {
    input: 'blah blah blah random text',
    expectedIntent: 'unknown',
    maxConfidence: 0.3,
  },
  {
    input: 'קבע ברית ב-12/11/2025 בתל אביב',
    expectedIntent: 'create_event',
    expectedEntities: {
      title: 'ברית',
      location: 'תל אביב',
    },
    minConfidence: 0.85,
  },
];

export const hebrewDateTestCases = [
  { input: 'היום', expectedOffset: 0 }, // today
  { input: 'מחר', expectedOffset: 1 }, // tomorrow
  { input: 'מחרתיים', expectedOffset: 2 }, // day after tomorrow
  { input: 'בעוד שבוע', expectedOffset: 7 }, // in a week
  { input: 'בעוד שבועיים', expectedOffset: 14 }, // in two weeks
  { input: 'יום ראשון', expectedDay: 0 }, // Sunday
  { input: 'יום שני', expectedDay: 1 }, // Monday
  { input: 'יום רביעי', expectedDay: 3 }, // Wednesday
  { input: '15/01/2025', expectedDate: '2025-01-15' }, // explicit date
  { input: '01/12/2025', expectedDate: '2025-12-01' }, // explicit date
];

export const edgeCases = {
  veryLongEventName: 'א'.repeat(500), // 500 characters
  emptyString: '',
  whitespaceOnly: '   ',
  specialChars: '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`',
  unicodeMix: 'Test עם מילים Mixed שפות',
  multilineInput: 'שורה ראשונה\nשורה שנייה\nשורה שלישית',
  htmlInjection: '<script>alert("xss")</script>',
  nullChar: 'test\x00null',
};

export const performanceData = {
  // Generate 100 events for performance testing
  manyEvents: Array.from({ length: 100 }, (_, i) => ({
    title: `אירוע ${i + 1}`,
    startTsUtc: new Date(Date.now() + i * 86400000), // i days from now
    location: i % 2 === 0 ? 'תל אביב' : 'ירושלים',
  })),

  // Generate 50 reminders
  manyReminders: Array.from({ length: 50 }, (_, i) => ({
    title: `תזכורת ${i + 1}`,
    dueTsUtc: new Date(Date.now() + i * 3600000), // i hours from now
  })),

  // Generate 20 contacts
  manyContacts: Array.from({ length: 20 }, (_, i) => ({
    name: `איש קשר ${i + 1}`,
    relation: i % 3 === 0 ? 'משפחה' : i % 3 === 1 ? 'עבודה' : 'חבר',
    aliases: [`alias${i}a`, `alias${i}b`],
  })),
};

export const errorScenarios = {
  invalidPhone: '+invalid',
  shortPin: '12',
  longPin: '123456',
  nonNumericPin: 'abcd',
  futureDateInPast: new Date('2020-01-01'),
  invalidTimezone: 'Invalid/Timezone',
  negativeDuration: -3600,
  tooManyEvents: 10000,
};

export const concurrencyTestData = {
  users: Array.from({ length: 10 }, (_, i) => ({
    phone: `+97255503${String(i).padStart(4, '0')}`,
    name: `משתמש ${i + 1}`,
    password: '1234',
  })),

  operations: [
    { type: 'createEvent', data: { title: 'פגישה' } },
    { type: 'createReminder', data: { title: 'תזכורת' } },
    { type: 'listEvents', data: {} },
    { type: 'searchEvents', data: { query: 'פגישה' } },
  ],
};
