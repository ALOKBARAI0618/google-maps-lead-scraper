// Message-rendering helpers for the email tool, split out so they can be unit
// tested without standing up the whole campaign. email-marketing.js re-exports
// these.

/**
 * Greets a lead by first name only when the business name really is a person's
 * name. Scraped rows are mostly business names, and "Hi Schmidt's" or
 * "Hi Hofbräuhaus" reads wrong in an outreach email.
 *
 * One-way heuristic: assume a business name unless the string clearly looks
 * like "First Last". Two gotchas seen in real scraped data - apostrophes arrive
 * as the typographic U+2019 (’), not a straight quote, and "Kitchen + Bar"
 * separates with a plus rather than an ampersand.
 */
const BUSINESS_MARK = /[’'’]s\b|\s&\s|\s\+\s|^(the|a|an)\s|\b(llc|inc|corp|co|ltd|llp|plc|company|group|enterprises?|services?|solutions?)\.?\s*$/i;

function greetingFor(lead) {
    const name = (lead.name || '').trim();
    if (!name) return 'Hi there';

    if (BUSINESS_MARK.test(name)) return `Hi ${name} team`;

    // Looks like a person only if it is 1-2 plain capitalised words with no
    // digits or punctuation. Kept strict: "Condado Tacos" is two words but is
    // a business, so a plural/plural-noun smell check excludes it.
    const words = name.split(/\s+/);
    const personLike = words.length <= 2
        && words.every((w) => /^[A-Z][a-zÀ-ɏ-]+$/.test(w))
        && !/(s|os|as|es)$/i.test(words[words.length - 1]);

    if (personLike) return `Hi ${words[0]}`;
    return `Hi ${name} team`;
}

module.exports = { greetingFor, BUSINESS_MARK };
