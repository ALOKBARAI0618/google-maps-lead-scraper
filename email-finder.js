/**
 * Email Finder — fetches a business website and extracts email addresses.
 * Ported from the Chrome extension's background.js + content.js email logic.
 */

const https = require('https');
const http = require('http');

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const BAD_EXT = /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf)$/i;
const BLACKLIST = [
  'example.com', 'sentry.io', 'sentry-next', 'wix.com', 'wixpress',
  'squarespace.com', 'wordpress.com', 'godaddy', 'placeholder', 'noreply',
  'no-reply', 'donotreply', 'test@', 'user@', 'email@', 'name@', 'yourname',
  'domain.com', 'yourdomain'
];
const ROLE_PRIORITY = [
  'info@', 'contact@', 'sales@', 'hello@', 'enquiries@',
  'enquiry@', 'admin@', 'office@', 'support@', 'mail@', 'reception@'
];

/**
 * Extract emails from raw HTML string.
 * @param {string} html
 * @returns {string[]} - sorted by priority (role-based first)
 */
function extractEmailsFromHtml(html) {
  if (!html) return [];
  const found = new Set();

  // 1) mailto: links
  const mailtoRe = /mailto:([^"'?>\s]+)/gi;
  let mm;
  while ((mm = mailtoRe.exec(html)) !== null) {
    try {
      const e = decodeURIComponent(mm[1]).split('?')[0].trim();
      if (e.includes('@')) found.add(e);
    } catch (_) {}
  }

  // 2) De-obfuscate common patterns + scan for plain-text emails
  const text = html
    .replace(/&#(?:64|x40);/gi, '@')
    .replace(/&#(?:46|x2e);/gi, '.')
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@')
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.');

  (text.match(EMAIL_RE) || []).forEach(e => found.add(e));

  // 3) Filter junk
  const clean = [...found]
    .map(e => e.replace(/^[.\-_]+|[.\-_]+$/g, '').trim())
    .filter(e => {
      const lower = e.toLowerCase();
      if (e.length > 80 || e.startsWith('@')) return false;
      if (BAD_EXT.test(lower)) return false;
      if (BLACKLIST.some(b => lower.includes(b))) return false;
      return /@[^@]+\.[a-z]{2,}$/i.test(lower);
    });

  // 4) Sort: prefer role-based mailboxes
  const uniq = [...new Set(clean.map(e => e.toLowerCase()))];
  uniq.sort((a, b) => {
    const ra = ROLE_PRIORITY.findIndex(r => a.startsWith(r));
    const rb = ROLE_PRIORITY.findIndex(r => b.startsWith(r));
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  });

  return uniq.slice(0, 5);
}

/**
 * Fetch a URL and return its HTML body.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
function fetchHtml(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!url) return resolve('');

    // Normalize URL
    let fullUrl = url;
    if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;

    const lib = fullUrl.startsWith('https') ? https : http;
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); resolve(''); }, timeoutMs);

    const req = lib.get(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: timeoutMs,
      signal: controller.signal
    }, (res) => {
      // Follow redirects (up to 3)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        clearTimeout(timer);
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, fullUrl).href;
        return fetchHtml(redirectUrl, timeoutMs - 2000).then(resolve).catch(() => resolve(''));
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
        // Cap at 500KB to avoid memory issues
        if (data.length > 500000) { res.destroy(); clearTimeout(timer); resolve(data); }
      });
      res.on('end', () => { clearTimeout(timer); resolve(data); });
      res.on('error', () => { clearTimeout(timer); resolve(''); });
    });

    req.on('error', () => { clearTimeout(timer); resolve(''); });
    req.on('timeout', () => { req.destroy(); clearTimeout(timer); resolve(''); });
  });
}

/**
 * Try to find an email from a business website.
 * Checks the homepage and common contact pages.
 * @param {string} websiteUrl
 * @returns {Promise<string>} - the best email found, or ''
 */
async function findEmail(websiteUrl) {
  if (!websiteUrl) return '';

  try {
    // Normalize
    let base = websiteUrl;
    if (!/^https?:\/\//i.test(base)) base = 'https://' + base;

    // 1) Try homepage
    const homeHtml = await fetchHtml(base, 10000);
    let emails = extractEmailsFromHtml(homeHtml);
    if (emails.length > 0) return emails[0];

    // 2) Try common contact pages
    const contactPaths = [
      '/contact', '/contact-us', '/about', '/about-us',
      '/contact-me', '/reach-us', '/get-in-touch', '/contact-page'
    ];
    for (const p of contactPaths) {
      try {
        const contactUrl = new URL(p, base).href;
        const contactHtml = await fetchHtml(contactUrl, 8000);
        emails = extractEmailsFromHtml(contactHtml);
        if (emails.length > 0) return emails[0];
      } catch (_) {}
    }
  } catch (e) {
    // Silently continue — website unreachable
  }

  return '';
}

/**
 * Unwrap Google redirect URLs to get the real destination.
 */
function unwrapGoogleRedirect(url) {
  if (!url) return '';
  const m = url.match(/[?&](?:q|url)=([^&]+)/);
  if (m) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (decoded.startsWith('http')) return decoded;
    } catch (_) {}
  }
  const m2 = url.match(/[?&]dest=([^&]+)/);
  if (m2) {
    try {
      const decoded = decodeURIComponent(m2[1]);
      if (decoded.startsWith('http')) return decoded;
    } catch (_) {}
  }
  if (/^https?:\/\//i.test(url) && !url.includes('google.com/url') && !url.includes('google.com/maps')) {
    return url;
  }
  return url;
}

module.exports = { findEmail, extractEmailsFromHtml, fetchHtml, unwrapGoogleRedirect };
