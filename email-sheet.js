/**
 * email-sheet.js — Google Sheet helpers for the email tool.
 * Reads the Status column (G) so the picker knows which emails have already
 * been marked DELIVERED in the sheet, and writes DELIVERED back after a
 * successful send so the sheet stays the source of truth.
 */
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function loadServiceAccountKey() {
  const fromFile = process.env.GSHEET_KEY_FILE;
  if (fromFile) {
    try { return JSON.parse(fs.readFileSync(fromFile, 'utf8')); } catch (e) { throw new Error(`GSHEET_KEY_FILE=${fromFile} could not be read: ${e.message}`); }
  }
  if (process.env.GSHEET_KEY_JSON) {
    try { return JSON.parse(process.env.GSHEET_KEY_JSON); } catch (e) { throw new Error(`GSHEET_KEY_JSON is not valid JSON: ${e.message}`); }
  }
  const raw = fs.readFileSync(path.join(__dirname, 'gsheet-uploader.js'), 'utf8');
  const m = raw.match(/const SERVICE_ACCOUNT_KEY = (\{[\s\S]+?\n\});/);
  if (m) return eval('(' + m[1] + ')');
  throw new Error('No service account key found (set GSHEET_KEY_FILE or GSHEET_KEY_JSON).');
}

function spreadsheetId() {
  if (process.env.GSHEET_SPREADSHEET_ID) return process.env.GSHEET_SPREADSHEET_ID;
  const raw = fs.readFileSync(path.join(__dirname, 'gsheet-uploader.js'), 'utf8');
  const id = raw.match(/SPREADSHEET_ID[^']*'([^']+)'/);
  return (id && id[1]) || '1heGxOHFJ-ZR-rV8wzgWnSKoosCSrHGiD3oLqoRorQds';
}

async function getSheets() {
  const key = loadServiceAccountKey();
  const auth = new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Reads column F (Email) + G (status) from every tab and returns:
 *   statuses: Map lowerEmail -> status string (first occurrence wins)
 *   byTab:    Map tabTitle -> { rowByEmail: Map lowerEmail -> rowNumber (1-based), statuses }
 * The row map is used for batch write-back after sending.
 */
async function readSheetStatuses() {
  const sheets = await getSheets();
  const id = spreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  const titles = meta.data.sheets.map(s=> s.properties.title);
  const statuses = new Map();
  const byTab = new Map();
  for (const title of titles) {
    const enc = `'${title.replace(/'/g,"''")}'`;
    let vals=[];
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${enc}!F1:G6000` });
      vals = res.data.values || [];
    } catch(_) { continue; }
    const rowByEmail = new Map();
    const tabStatuses = new Map();
    for (let i=1;i<vals.length;i++) {
      const email = String(vals[i][0]||'').trim().toLowerCase();
      const status = String(vals[i][1]||'').trim();
      if(!email || !email.includes('@')) continue;
      if(!rowByEmail.has(email)) rowByEmail.set(email, i+1);
      if(!tabStatuses.has(email)) tabStatuses.set(email, status);
      if(!statuses.has(email)) statuses.set(email, status);
    }
    byTab.set(title, { rowByEmail, tabStatuses });
  }
  return { statuses, byTab, titles };
}

async function writeStatuses(updates) {
  // updates: [{ tab, row, status }]
  if(!updates.length) return;
  const sheets = await getSheets();
  const id = spreadsheetId();
  const data = updates.map(u=> ({
    range: `'${u.tab.replace(/'/g,"''")}'!G${u.row}`,
    values: [[u.status]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

module.exports = { spreadsheetId, getSheets, readSheetStatuses, writeStatuses };
