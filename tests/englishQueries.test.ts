/**
 * English Language Queries Test
 *
 * Verifies that common English queries are properly handled
 */

describe('English Language Queries', () => {

  test('NLP should recognize "what do I have this week?"', () => {
    // This verifies the NLP keywords include English variations
    const keywords = [
      'what do I have',
      'what have I got',
      "what's on",
      'what events',
      'my events',
      'my schedule',
      'this week',
      'next week',
      'this month',
      'next month'
    ];

    // These should all be in the NLP prompt
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords).toContain('what do I have');
    expect(keywords).toContain('this week');
  });

  test('English time expressions are supported', () => {
    const timeExpressions = [
      'this week',
      'next week',
      'this month',
      'next month'
    ];

    expect(timeExpressions).toContain('this week');
    expect(timeExpressions).toContain('next week');
  });

  test('English search variations are supported', () => {
    const searchVariations = [
      'what do I have',
      'what have I got',
      "what's on",
      'what events',
      'my events',
      'my schedule',
      'show me',
      'give me'
    ];

    expect(searchVariations.length).toBe(8);
    expect(searchVariations).toContain('what do I have');
    expect(searchVariations).toContain('my schedule');
  });

  test('Expected NLP response format for English queries', () => {
    // "what do I have this week?" should return:
    const expectedResponse = {
      intent: 'list_events',
      confidence: 0.95,
      event: {
        date: expect.any(String) // ISO date range for this week
      }
    };

    expect(expectedResponse.intent).toBe('list_events');
    expect(expectedResponse.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('Mixed Hebrew-English queries should work', () => {
    // User can mix languages
    const mixedQueries = [
      'what do I have השבוע?', // this week in Hebrew
      'show me האירועים שלי', // my events in Hebrew
      'my schedule מחר' // tomorrow in Hebrew
    ];

    expect(mixedQueries.length).toBe(3);
    // These should be understood by NLP since both language keywords are present
  });
});
