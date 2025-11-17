/**
 * Greeting Detection Utility
 *
 * Shared utility for detecting greeting messages across the application.
 * Used by both MessageRouter (new user registration) and NLPRouter (existing user greetings).
 *
 * Supports:
 * - Hebrew greetings (basic, time-based, casual/slang)
 * - English greetings (basic, time-based, casual/slang)
 * - Other languages (French, Spanish, Italian, Hawaiian)
 */

/**
 * Check if a message is a greeting
 *
 * @param text - The message text to check
 * @returns true if the message matches any greeting pattern, false otherwise
 *
 * @example
 * isGreeting('היי') // true
 * isGreeting('hello') // true
 * isGreeting('👍') // false
 * isGreeting('ططط') // false (gibberish)
 */
export function isGreeting(text: string): boolean {
  const normalizedText = text.trim().toLowerCase();

  const greetingPatterns = [
    // Hebrew greetings - basic
    /^היי$/,           // היי
    /^היי!$/,          // היי!
    /^הי$/,            // הי
    /^הי!$/,           // הי!
    /^שלום$/,          // שלום
    /^שלום!$/,         // שלום!
    /^שלום לך$/,       // שלום לך
    /^שלום רב$/,       // שלום רב
    /^הלו$/,           // הלו
    /^הלו!$/,          // הלו!
    /^שלומות$/,        // שלומות
    /^שלומה$/,         // שלומה
    /^ש?לום$/,         // שלום (with typo)

    // Hebrew greetings - time-based
    /^בוקר טוב$/,      // בוקר טוב
    /^בוקר טוב!$/,     // בוקר טוב!
    /^בוקר$/,          // בוקר
    /^ערב טוב$/,       // ערב טוב
    /^ערב טוב!$/,      // ערב טוב!
    /^לילה טוב$/,      // לילה טוב
    /^לילה טוב!$/,     // לילה טוב!
    /^צהריים טובים$/,  // צהריים טובים
    /^צהריים טובים!$/, // צהריים טובים!

    // Hebrew greetings - casual/slang
    /^מה קורה$/,       // מה קורה
    /^מה קורה\?$/,     // מה קורה?
    /^מה נשמע$/,       // מה נשמע
    /^מה נשמע\?$/,     // מה נשמע?
    /^מה המצב$/,       // מה המצב
    /^מה המצב\?$/,     // מה המצב?
    /^מה העניינים$/,   // מה העניינים
    /^מה העניינים\?$/, // מה העניינים?
    /^מה המצב אחי$/,   // מה המצב אחי
    /^מה המצב אחויה$/, // מה המצב אחויה
    /^מה הולך$/,       // מה הולך
    /^מה הולך\?$/,     // מה הולך?
    /^מה המעניין$/,    // מה המעניין
    /^מה מצבך$/,       // מה מצבך
    /^מה שלומך$/,      // מה שלומך
    /^מה שלומך\?$/,    // מה שלומך?
    /^שלומך$/,         // שלומך
    /^איך אתה$/,       // איך אתה
    /^איך את$/,        // איך את
    /^יו$/,            // יו
    /^יו!$/,           // יו!
    /^יאו$/,           // יאו
    /^וואלה$/,         // וואלה
    /^יאללה$/,         // יאללה

    // English greetings - basic
    /^hello$/,         // hello
    /^hello!$/,        // hello!
    /^hi$/,            // hi
    /^hi!$/,           // hi!
    /^hey$/,           // hey
    /^hey!$/,          // hey!
    /^heyy$/,          // heyy
    /^heyyy$/,         // heyyy
    /^hii$/,           // hii
    /^hiii$/,          // hiii
    /^hiya$/,          // hiya
    /^howdy$/,         // howdy
    /^greetings$/,     // greetings
    /^salutations$/,   // salutations

    // English greetings - time-based
    /^good morning$/,  // good morning
    /^good morning!$/, // good morning!
    /^morning$/,       // morning
    /^morning!$/,      // morning!
    /^good afternoon$/,// good afternoon
    /^afternoon$/,     // afternoon
    /^good evening$/,  // good evening
    /^good evening!$/, // good evening!
    /^evening$/,       // evening
    /^good night$/,    // good night
    /^good night!$/,   // good night!
    /^night$/,         // night

    // English greetings - casual/slang
    /^sup$/,           // sup
    /^sup\?$/,         // sup?
    /^what's up$/,     // what's up
    /^what's up\?$/,   // what's up?
    /^whats up$/,      // whats up
    /^whats up\?$/,    // whats up?
    /^whatsup$/,       // whatsup
    /^whatsup\?$/,     // whatsup?
    /^wassup$/,        // wassup
    /^wassup\?$/,      // wassup?
    /^wazzup$/,        // wazzup
    /^how are you$/,   // how are you
    /^how are you\?$/, // how are you?
    /^how r u$/,       // how r u
    /^how r u\?$/,     // how r u?
    /^how's it going$/,// how's it going
    /^how's it going\?$/,// how's it going?
    /^hows it going$/,  // hows it going
    /^how are ya$/,    // how are ya
    /^how do you do$/,  // how do you do
    /^yo$/,            // yo
    /^yo!$/,           // yo!
    /^yoo$/,           // yoo
    /^oi$/,            // oi
    /^aloha$/,         // aloha

    // Mixed/Casual
    /^ahoy$/,          // ahoy
    /^bonjour$/,       // bonjour
    /^hola$/,          // hola
    /^ciao$/,          // ciao
  ];

  return greetingPatterns.some(pattern => pattern.test(normalizedText));
}
