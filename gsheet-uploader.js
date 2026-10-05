const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_KEY = {
  "type": "service_account",
  "project_id": "REPLACE_ME",
  "private_key_id": "REPLACE_ME",
  "private_key": "-----BEGIN PRIVATE KEY-----\nREPLACE_ME\n-----END PRIVATE KEY-----\n",
  "client_email": "REPLACE_ME@REPLACE_ME.iam.gserviceaccount.com",
  "client_id": "REPLACE_ME",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/REPLACE_ME",
  "universe_domain": "googleapis.com"
};

// The service account key. Prefer a JSON file at GSHEET_KEY_FILE or a raw JSON
// string in GSUITE_KEY_JSON so the private key never has to live in the
// repository or the Docker image. Falls back to the embedded key below so
// existing setups keep working with no configuration change.
function loadServiceAccountKey() {
  const fromFile = process.env.GSHEET_KEY_FILE;
  if (fromFile) {
    try {
      return JSON.parse(fs.readFileSync(fromFile, 'utf8'));
    } catch (err) {
      throw new Error(`GSHEET_KEY_FILE=${fromFile} could not be read as JSON: ${err.message}`);
    }
  }
  if (process.env.GSHEET_KEY_JSON) {
    try {
      return JSON.parse(process.env.GSHEET_KEY_JSON);
    } catch (err) {
      throw new Error(`GSHEET_KEY_JSON is not valid JSON: ${err.message}`);
    }
  }
  return SERVICE_ACCOUNT_KEY;
}

const SPREADSHEET_ID = process.env.GSHEET_SPREADSHEET_ID || '1heGxOHFJ-ZR-rV8wzgWnSKoosCSrHGiD3oLqoRorQds';

async function getSheetsAuth() {
  // googleapis >= 14 dropped the positional (email, keyFile, key, scopes) constructor.
  const key = loadServiceAccountKey();
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A large campaign can create dozens of tabs in one go, which blows past the
// Sheets "write requests per minute" quota. Retry with exponential backoff so
// a rate limit drops leads instead of failing the whole sync.
async function sheetsCall(fn, label) {
  const MAX_ATTEMPTS = 6;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err.message || '');
      const isQuota = err.code === 429 || /quota/i.test(msg);
      const isTransientNet = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|getaddrinfo|network/i.test(msg) || /oauth2.googleapis.com/i.test(msg);
      const retryable = isQuota || isTransientNet;
      if (!retryable || attempt === MAX_ATTEMPTS) throw err;
      const backoff = Math.min(30000, 2000 * 2 ** (attempt - 1));
      const reason = isQuota ? 'quota' : 'transient network';
      console.log(`Sheets ${reason} hit on ${label}; retrying in ${backoff}ms (attempt ${attempt}/${MAX_ATTEMPTS}) — ${msg.slice(0, 120)}`);
      await sleep(backoff);
    }
  }
}

async function listExistingSheets(sheetsApi) {
  const spreadsheet = await sheetsCall(
    () => sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }),
    'list tabs'
  );
  return new Set(spreadsheet.data.sheets.map((s) => s.properties.title));
}

async function ensureSheetExists(sheetsApi, sheetName, knownTabs) {
  if (knownTabs.has(sheetName)) return;
  await sheetsCall(
    () => sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    }),
    `create tab [${sheetName}]`
  );

  // User specified columns: Name, Category, Address, Rating, Reviews, Email
  const headers = ['Name', 'Category', 'Address', 'Rating', 'Reviews', 'Email'];
  await sheetsCall(
    () => sheetsApi.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    }),
    `headers [${sheetName}]`
  );
  knownTabs.add(sheetName);
}

// Google Maps reports a search for "Restaurants" as dozens of subtypes
// ("German restaurant", "Bar & grill", "Steak house"...). Group them onto a
// single tab instead of opening a new sheet for every subtype.
const DINING_WORDS = [
  'restaurant', 'cafe', 'coffee', 'bar', 'grill', 'bistro', 'diner', 'brewery',
  'beer garden', 'steak house', 'steakhouse', 'sandwich', 'bakery', 'pizzeria',
  'pizza', 'tavern', 'pub', 'tapas', 'eatery', 'juice', 'smoothie', 'ice cream',
  'dessert', 'takeaway', 'takeout', 'brunch', 'breakfast', 'barbecue',
];

const CATEGORY_GROUPS = [
  { words: DINING_WORDS, stems: [], tab: 'Restaurants', label: 'Restaurant' },
  { words: ['dentist', 'dental', 'tooth'], stems: ['orthodont', 'dent'], tab: 'Dentist', label: 'Dentist' },
  { words: [], stems: ['plumb'], tab: 'plumber', label: 'Plumber' },
];

function categorize(rawCategory) {
  const source = String(rawCategory || '').trim();
  const lower = source.toLowerCase();

  const matches = (list, prefix) => list.some((w) => {
    const body = w.replace(/[ -]/g, '[ -]');
    return prefix
      ? new RegExp(`\\b${body}`).test(lower)   // stem: "orthodont" also covers "Orthodontist"
      : new RegExp(`\\b${body}\\b`).test(lower); // full word so "bar" never catches "barber"
  });

  for (const group of CATEGORY_GROUPS) {
    if (matches(group.words, false) || matches(group.stems, true)) {
      return { tab: group.tab, label: group.label, matched: true };
    }
  }

  // Fall back to the leading words, stripped of digits/punctuation
  const catMatch = source.match(/^([a-zA-Z\s]+)/);
  const name = catMatch ? catMatch[1].trim() : '';
  const tab = name || 'General';
  return { tab, label: tab, matched: false };
}

// Look up the group that owns a given tab name, so a fallback can reuse its
// row label (e.g. defaultTab "Restaurants" -> label "Restaurant").
function groupForTabName(tabName) {
  const want = String(tabName || '').trim().toLowerCase();
  return CATEGORY_GROUPS.find((g) => g.tab.trim().toLowerCase() === want);
}

// Match a target tab against the real sheet even when the existing tab has a
// different case or a trailing space (the live sheet has a "Restaurants " tab).
function resolveTabName(normalizedTab, exactTitles) {
  const wanted = normalizedTab.trim().toLowerCase();
  for (const exact of exactTitles) {
    if (exact.trim().toLowerCase() === wanted) return exact;
  }
  return normalizedTab;
}

async function appendLeadsToSheet(leads, options = {}) {
  try {
    const auth = await getSheetsAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Only process leads with emails (Handle both 'email' and 'Email' keys)
    const emailLeads = leads.filter(l => (l.Email || l.email) && String(l.Email || l.email).includes('@'));
    if (emailLeads.length === 0) return { success: true, count: 0 };

    // Fetch the tab list once for the whole sync instead of once per category.
    const knownTabs = await listExistingSheets(sheets);
    const exactTitles = [...knownTabs];

    // When a campaign is running ("Restaurants" across cities), Google Maps
    // still labels odd listings with unrelated subtypes ("Warehouse store").
    // Route those onto the campaign's own tab instead of opening a new sheet.
    const defaultTab = options.defaultTab || '';
    const defaultGroup = groupForTabName(defaultTab);
    const defaultLabel = defaultGroup ? defaultGroup.label : defaultTab;

    // Group rows by target sheet so we make one append per category instead of
    // one per lead (a 70-lead sync used to be 140+ API round-trips).
    const byCategory = new Map();
    const existingEmails = new Map(); // tab -> Set of emails already on it
    let skippedDuplicates = 0;

    for (const lead of emailLeads) {
      const { tab, label, matched } = categorize(lead.Category || lead.category || 'General');
      let targetTab = resolveTabName(tab, exactTitles);
      let rowLabel = label;
      if (!matched && defaultTab) {
        targetTab = resolveTabName(defaultTab, exactTitles);
        rowLabel = defaultLabel;
      }
      const email = String(lead.Email || lead.email || '').trim().toLowerCase();

      // Read each target tab once so we never append a lead that is already
      // there (e.g. two campaigns covering the same city).
      if (!existingEmails.has(targetTab)) {
        const set = new Set();
        // A tab that doesn't exist yet has nothing to dedupe against, and
        // reading its range throws "Unable to parse range" — so seed an empty
        // set and let ensureSheetExists create it further down.
        if (knownTabs.has(targetTab)) {
          const existing = await sheetsCall(
            () => sheets.spreadsheets.values.get({
              spreadsheetId: SPREADSHEET_ID,
              range: `${targetTab}!F1:F6000`,
            }),
            `read emails [${targetTab}]`
          );
          for (const r of (existing.data.values || [])) {
            if (r[0]) set.add(String(r[0]).trim().toLowerCase());
          }
        }
        existingEmails.set(targetTab, set);
      }
      if (existingEmails.get(targetTab).has(email)) {
        skippedDuplicates++;
        continue;
      }
      existingEmails.get(targetTab).add(email);

      // Sync only specified columns: Name, Category, Address, Rating, Reviews, Email.
      // Columns past F (status / Date / Remarks) are owned by the user and left alone.
      const row = [
        lead.Name || lead.name || '',
        rowLabel,
        lead.Address || lead.address || '',
        lead.Rating || lead.rating || '',
        lead.Reviews || lead.reviews || '',
        lead.Email || lead.email || '',
      ];

      if (!byCategory.has(targetTab)) byCategory.set(targetTab, []);
      byCategory.get(targetTab).push(row);
    }

    for (const [targetTab, rows] of byCategory) {
      await ensureSheetExists(sheets, targetTab, knownTabs);
      const resp = await sheetsCall(
        () => sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${targetTab}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: rows },
        }),
        `append [${targetTab}]`
      );
      // The API reports exactly where the rows landed. Sheets append inserts
      // after the last row holding data, which can sit far below a visible gap,
      // so log the range to make the result auditable.
      const landed = resp && resp.data && resp.data.updates && resp.data.updates.updatedRange;
      console.log(`Sheets: appended ${rows.length} row(s) to tab [${targetTab}] at ${landed || '(range unknown)'}`);
    }

    if (skippedDuplicates > 0) {
      console.log(`Sheets: skipped ${skippedDuplicates} lead(s) already present`);
    }

    return {
      success: true,
      count: emailLeads.length - skippedDuplicates,
      skippedDuplicates,
      tabs: [...byCategory.keys()],
    };
  } catch (err) {
    console.error('Google Sheets Error:', err);
    throw err;
  }
}

module.exports = { appendLeadsToSheet };