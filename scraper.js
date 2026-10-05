#!/usr/bin/env node
/**
 * Maps Lead Scraper Agent — Standalone Playwright-based scraper
 * 
 * Usage:
 *   node scraper.js "digital marketing mumbai"
 *   node scraper.js "dentists" --city mumbai
 *   node scraper.js "cafes" --city mumbai --areas "Andheri,Bandra,Juhu"
 *   node scraper.js "plumber delhi" --headed    (visible browser)
 * 
 * Output: CSV file saved to ./output/ folder
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { detectCityAndAreas } = require('./areas-loader');
const { findEmail, unwrapGoogleRedirect } = require('./email-finder');

// ===== CONFIG =====
const CARD_DELAY = 350;          // ms between processing each card
const SCROLL_DELAY = 600;        // ms between scroll steps
const SCROLL_BOTTOM_DELAY = 1000; // ms when at bottom waiting for lazy-load
const MAX_SCROLL_NO_GROWTH = 12; // scrolls with no new results before stopping
const MAX_SCROLL_ATTEMPTS = 80;  // hard cap on scroll iterations
const AREA_PAUSE_MIN = 4000;     // ms pause between area searches
const AREA_PAUSE_MAX = 8000;
const AUTOSAVE_INTERVAL = 50;    // save CSV every N leads

// ===== PARSE CLI ARGS =====
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    query: '',
    city: '',
    areas: [],
    headed: false,
    output: '',
    quick: false,
    limit: 0,
    proxy: '',
    noAreas: false,
    areaLabel: '',
  };

  let i = 0;
  while (i < args.length) {
    if (args[i] === '--city' && args[i + 1]) { opts.city = args[i + 1]; i += 2; }
    else if (args[i] === '--areas' && args[i + 1]) { opts.areas = args[i + 1].split(',').map(a => a.trim()); i += 2; }
    else if (args[i] === '--headed') { opts.headed = true; i++; }
    else if (args[i] === '--quick') { opts.quick = true; i++; }
    else if (args[i] === '--no-areas') { opts.noAreas = true; i++; }
    else if (args[i] === '--area-label' && args[i + 1]) { opts.areaLabel = args[i + 1]; i += 2; }
    else if (args[i] === '--limit' && args[i + 1]) { opts.limit = parseInt(args[i + 1], 10); i += 2; }
    else if (args[i] === '--output' && args[i + 1]) { opts.output = args[i + 1]; i += 2; }
    else if (args[i] === '--proxy' && args[i + 1]) { opts.proxy = args[i + 1]; i += 2; }
    else if (!args[i].startsWith('--')) { opts.query = args[i]; i++; }
    else { i++; }
  }

  return opts;
}

// ===== HELPERS =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
function humanPause(min, max) { return sleep(rand(min, max)); }

async function safeGoto(page, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      return true;
    } catch (err) {
      const isNetworkError = err.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
                             err.message.includes('net::ERR_CONNECTION_REFUSED') ||
                             err.message.includes('net::ERR_TIMED_OUT');

      if (isNetworkError && i < retries - 1) {
        const waitTime = (i + 1) * 5000;
        log(`${colors.yellow}⚠ Network error detected. Retrying in ${waitTime/1000}s... (Attempt ${i+1}/${retries})${colors.reset}`);
        await sleep(waitTime);
      } else {
        throw err;
      }
    }
  }
  return false;
}

function normalizeLeadText(value) {
  return (value || '').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function leadDedupeKey(lead) {
  const url = lead.googleMapsUrl || '';
  // Try place ID from URL
  const hex = url.match(/0x[0-9a-f]+:0x[0-9a-f]+/i);
  if (hex) return 'hex:' + hex[0].toLowerCase();
  const queryId = url.match(/[?&](?:cid|query_place_id|place_id)=([^&]+)/i);
  if (queryId) return 'qid:' + decodeURIComponent(queryId[1]).toLowerCase();

  const phones = lead.phones || (lead.phone ? [lead.phone] : []);
  const phone = (phones[0] || '').replace(/\D/g, '').slice(-10);
  const name = normalizeLeadText(lead.name);
  const host = (lead.website || '').replace(/^https?:\/\/(www\.)?/i, '').split('/')[0].toLowerCase();
  if (name && phone) return 'np:' + name + '|' + phone;
  if (name && host) return 'nw:' + name + '|' + host;
  return name ? 'n:' + name : '';
}

// ===== EXCEL OUTPUT =====
const ExcelJS = require('exceljs');

const JUNK_WEBSITE_REGEX = /^(https?:\/\/)?(www\.)?(facebook\.com|fb\.com|fb\.me|instagram\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|linkedin\.com|bit\.ly|tinyurl\.com|goo\.gl|null\.com|undefined|justdial\.com|indiamart\.com|tradeindia\.com|magicbricks\.com|99acres\.com|housing\.com|nobroker\.in|sulekha\.com|google\.com|business\.site)/i;

function isRealWebsite(url) {
  if (!url || typeof url !== 'string') return false;
  const cleaned = url.trim().toLowerCase();
  if (!cleaned || cleaned === 'no website' || cleaned === 'null' || cleaned.length < 5) return false;
  if (JUNK_WEBSITE_REGEX.test(cleaned)) return false;
  return true;
}

function leadHasPhone(phones) {
  if (!Array.isArray(phones)) return false;
  return phones.some(p => String(p || '').replace(/\D/g, '').length >= 7);
}

// Keyword-based business classification: Premium / Small Business / Standard
const PREMIUM_KEYWORDS = [
  'luxury', 'premium', 'elite', 'gourmet', 'fine dining', 'boutique', 'resort',
  'spa', 'country club', 'golf club', 'concierge', 'executive', 'signature',
  'platinum', 'gold', 'royal', 'grand', 'the '
];
const CHAIN_KEYWORDS = ['inc', 'llc', 'corp', 'corporation', 'group', 'chains', 'franchise'];

function classifyLead(lead, leadType) {
  const name = (lead.name || '').toLowerCase();
  const reviews = parseInt(lead.reviews, 10) || 0;
  const rating = parseFloat(lead.rating) || 0;
  const hasEmail = !!(lead.email && String(lead.email).includes('@'));
  const hasSite = isRealWebsite(lead.website);

  // No phone or no online presence at all -> low priority
  if (leadType.includes('NO PHONE')) return 'Low Priority';

  const isPremium = PREMIUM_KEYWORDS.some(k => name.includes(k));
  const isChain = CHAIN_KEYWORDS.some(k => name.includes(k));

  // Premium: strong reputation signals + full contact stack
  if ((isPremium || (rating >= 4.5 && reviews >= 200)) && hasEmail && hasSite) return 'Premium';

  // Established small business: decent reviews and at least a website or email
  if (reviews >= 50 && (hasSite || hasEmail)) return isChain ? 'Chain/Enterprise' : 'Small Business';

  return 'Standard';
}

// CRM tracking columns — standardized 7 options
const CRM_COLUMNS = [
  { header: 'Call',                        key: 'call',       width: 14, options: ['Yes', 'No', 'Pending', 'Yes (After This Week)'] },
  { header: 'Not Call',                    key: 'notCall',    width: 14, options: ['Yes', 'No', 'Pending'] },
  { header: 'Asking for Detailed',         key: 'detailed',   width: 20, options: ['Yes', 'No', 'Pending', 'Sent'] },
  { header: 'Directly Rejected',           key: 'rejected',   width: 18, options: ['Yes', 'No'] },
  { header: 'Follow Up Date',              key: 'followUp',   width: 16, options: null },
  { header: 'What was discussed on call?', key: 'discussed',  width: 32, options: null },
  { header: 'Notes',                       key: 'notes',      width: 30, options: null },
];

async function saveExcel(leads, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maps Lead Scraper Agent';
  wb.created = new Date();

  const ws = wb.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
    properties: { defaultRowHeight: 22 },
  });

  const dataColumns = [
    { header: 'S.No',            key: 'sno',      width: 7  },
    { header: 'Name',            key: 'name',     width: 32 },
    { header: 'Category',        key: 'category', width: 26 },
    { header: 'Address',         key: 'address',  width: 36 },
    { header: 'Rating',          key: 'rating',   width: 9  },
    { header: 'Reviews',         key: 'reviews',  width: 10 },
    { header: 'Email',           key: 'email',    width: 30 },
    { header: 'Google Maps URL', key: 'mapsUrl',  width: 18 },
    { header: 'Area',            key: 'area',     width: 16 },
    { header: 'Status',          key: 'status',   width: 14 },
    { header: 'Lead Type',       key: 'leadType', width: 22 },
    { header: 'Phone 1',         key: 'phone1',   width: 18 },
    { header: 'Phone 2',         key: 'phone2',   width: 18 },
    { header: 'Phone 3',         key: 'phone3',   width: 18 },
    { header: 'Website',         key: 'website',  width: 28 },
    { header: 'Facebook',        key: 'facebook', width: 28 },
    { header: 'Instagram',       key: 'instagram', width: 28 },
    { header: 'LinkedIn',        key: 'linkedin', width: 28 },
    { header: 'Twitter',         key: 'twitter', width: 28 },
    { header: 'Lead Class',      key: 'leadClass', width: 18 },
  ];

  ws.columns = [...dataColumns, ...CRM_COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }))];

  // Header styling
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  const crmStartCol = dataColumns.length + 1;
  headerRow.eachCell((cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colNum >= crmStartCol ? 'FF0E4D45' : 'FF1F4E79' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0D3B66' } }, bottom: { style: 'medium', color: { argb: 'FF0D3B66' } },
      left: { style: 'thin', color: { argb: 'FF0D3B66' } }, right: { style: 'thin', color: { argb: 'FF0D3B66' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  // Data rows & categorization
  const cellFont = { size: 10, name: 'Calibri' };
  const cellBorder = { bottom: { style: 'thin', color: { argb: 'FFBFCFE0' } }, right: { style: 'thin', color: { argb: 'FFBFCFE0' } }, left: { style: 'thin', color: { argb: 'FFBFCFE0' } } };
  const evenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
  const oddFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  const trackFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };

  let counts = { hotTarget: 0, hasWebsite: 0, noPhone: 0 };

  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    const phones = l.phones || (l.phone ? [l.phone] : []);

    const validPhone = leadHasPhone(phones);
    const realSite = isRealWebsite(l.website);

    let leadType = '';
    let leadTypeFill = null;
    let leadTypeFont = { size: 10, name: 'Calibri', bold: true };

    if (!validPhone) {
      leadType = '🔴 NO PHONE';
      counts.noPhone++;
      leadTypeFont.color = { argb: 'FF888888' };
      leadTypeFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    } else if (!realSite) {
      leadType = '🟢 HOT CALL TARGET';
      counts.hotTarget++;
      leadTypeFont.color = { argb: 'FF006100' };
      leadTypeFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
    } else {
      leadType = '🔵 HAS REAL WEBSITE';
      counts.hasWebsite++;
      leadTypeFont.color = { argb: 'FF002060' };
      leadTypeFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    }

    const rowData = {
      sno: i + 1, name: l.name || '', category: l.category || '', address: l.address || '',
      rating: l.rating || '', reviews: l.reviews || '', email: l.email || '',
      mapsUrl: l.googleMapsUrl || '', area: l.scrapedFrom || '', status: l.status || '',
      leadType: leadType,
      phone1: phones[0] || '', phone2: phones[1] || '', phone3: phones[2] || '', website: l.website || '',
      facebook: l.facebook || '', instagram: l.instagram || '', linkedin: l.linkedin || '', twitter: l.twitter || '',
      leadClass: classifyLead(l, leadType),
    };
    for (const crm of CRM_COLUMNS) rowData[crm.key] = '';

    const row = ws.addRow(rowData);
    const fill = i % 2 === 0 ? evenFill : oddFill;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = colNum >= crmStartCol ? trackFill : fill;
      cell.border = cellBorder;
      cell.font = { ...cellFont };
      cell.alignment = { vertical: 'middle', wrapText: false };
    });
    row.height = 22;

    // Apply specific styling to Lead Type cell
    const ltCell = row.getCell('leadType');
    ltCell.fill = leadTypeFill;
    ltCell.font = leadTypeFont;
    ltCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Hyperlinks
    const urlCell = row.getCell('mapsUrl');
    if (l.googleMapsUrl && l.googleMapsUrl.startsWith('http')) {
      urlCell.value = { text: 'Open Map 📍', hyperlink: l.googleMapsUrl };
      urlCell.font = { ...cellFont, color: { argb: 'FF0563C1' }, underline: true };
    }
    const webCell = row.getCell('website');
    if (l.website && l.website.startsWith('http')) {
      webCell.value = { text: l.website.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0], hyperlink: l.website };
      webCell.font = { ...cellFont, color: { argb: 'FF0563C1' }, underline: true };
    }

    // Status color
    const sc = row.getCell('status');
    if (l.status === 'Email Found') sc.font = { ...cellFont, bold: true, color: { argb: 'FF217346' } };
    else if (l.status === 'No Email') sc.font = { ...cellFont, color: { argb: 'FFBF8F00' } };
    else sc.font = { ...cellFont, color: { argb: 'FFCC3300' } };

    // S.No center + Rating bold center
    row.getCell('sno').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('sno').font = { ...cellFont, bold: true, color: { argb: 'FF555555' } };
    row.getCell('rating').font = { ...cellFont, bold: true };
    row.getCell('rating').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('reviews').alignment = { vertical: 'middle', horizontal: 'center' };
  }

  // Add Summary Rows at Bottom
  const lastDataRow = leads.length + 1;
  const leadTypeColIndex = ws.getColumn('leadType').number;

  ws.addRow([]); // Blank spacer row

  function addSummaryRow(label, count, fontColor, bgColor) {
    const row = ws.addRow({});
    row.height = 22;
    const labelCell = row.getCell(leadTypeColIndex - 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 11, name: 'Calibri', color: { argb: fontColor } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'right' };
    labelCell.border = { bottom: { style: 'thin', color: { argb: 'FFBFCFE0' } }, top: { style: 'thin', color: { argb: 'FFBFCFE0' } } };

    const countCell = row.getCell(leadTypeColIndex);
    countCell.value = count;
    countCell.font = { bold: true, size: 12, name: 'Calibri', color: { argb: fontColor } };
    countCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    countCell.alignment = { vertical: 'middle', horizontal: 'center' };
    countCell.border = { bottom: { style: 'thin', color: { argb: 'FFBFCFE0' } }, top: { style: 'thin', color: { argb: 'FFBFCFE0' } } };
  }

  addSummaryRow('🟢 Total Hot Call Targets (Phone ✅, Site ❌)', counts.hotTarget, 'FF006100', 'FFC6EFCE');
  addSummaryRow('🔵 Total Has Real Website (Phone ✅, Site ✅)', counts.hasWebsite, 'FF002060', 'FFDDEBF7');
  addSummaryRow('🔴 Total No Phone (Cannot Call)', counts.noPhone, 'FF888888', 'FFEEEEEE');
  addSummaryRow('📊 GRAND TOTAL LEADS', leads.length, 'FF1F4E79', 'FFE6EEF8');

  // Dropdown validations
  for (const crm of CRM_COLUMNS) {
    if (!crm.options) continue;
    const colNum = ws.getColumn(crm.key).number;
    for (let r = 2; r <= lastDataRow; r++) {
      ws.getCell(r, colNum).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${crm.options.join(',')}"`], showDropDown: true };
    }
  }

  // Auto-filter data range
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastDataRow, column: ws.columns.length } };

  // Save safely
  try {
    await wb.xlsx.writeFile(filePath);
  } catch (err) {
    if (err.code === 'EBUSY') {
      const altPath = filePath.replace(/\.xlsx$/i, `-alt-${Date.now()}.xlsx`);
      log(`${colors.yellow}⚠ Excel locked. Saving to: ${altPath}${colors.reset}`);
      await wb.xlsx.writeFile(altPath).catch(() => {});
    } else {
      log(`${colors.red}⚠ Excel save error: ${err.message}${colors.reset}`);
    }
  }
}

// Fallback CSV for auto-save (faster, used during scraping)
function saveCSVQuick(leads, csvPath) {
  try {
    const dir = path.dirname(csvPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const headers = 'S.No,Name,Category,Address,Rating,Reviews,Email,Area,Status,Phone 1,Phone 2,Phone 3,Website\n';
    const rows = leads.map((l, i) => {
      const phones = l.phones || (l.phone ? [l.phone] : []);
      const esc = v => { const s = String(v||'').replace(/"/g,'""'); return s.includes(',') || s.includes('"') ? `"${s}"` : s; };
      return [i+1, l.name, l.category, l.address, l.rating, l.reviews, l.email, l.scrapedFrom, l.status, phones[0]||'', phones[1]||'', phones[2]||'', l.website].map(esc).join(',');
    }).join('\n');
    fs.writeFileSync(csvPath, '\ufeff' + headers + rows, 'utf8');
  } catch (err) {
    if (err.code === 'EBUSY') {
      log(`${colors.dim}[⚠ Auto-save CSV file locked by Excel/editor — skipping auto-save cycle]${colors.reset}`);
    } else {
      log(`${colors.yellow}[⚠ Auto-save warning: ${err.message}]${colors.reset}`);
    }
  }
}

async function loadExistingXlsx(filePath, allLeads, seenKeys) {
  if (!fs.existsSync(filePath)) return;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('Leads') || wb.worksheets[0];
    const headerRow = ws.getRow(1).values;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const lead = {};
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const header = headerRow[colNum];
        if (header) {
          let val = cell.value;
          if (val && typeof val === 'object' && val.text) val = val.text;
          lead[header] = val;
        }
      });

      // Map Excel headers back to scraper internal keys
      const internalLead = {
        name: lead['Name'],
        category: lead['Category'],
        address: lead['Address'],
        rating: lead['Rating'],
        reviews: lead['Reviews'],
        email: lead['Email'],
        googleMapsUrl: lead['Google Maps URL'],
        scrapedFrom: lead['Area'],
        status: lead['Status'],
        leadClass: lead['Lead Class'],
        phones: [lead['Phone 1'], lead['Phone 2'], lead['Phone 3']].filter(Boolean),
        website: lead['Website'],
        facebook: lead['Facebook'],
        instagram: lead['Instagram'],
        linkedin: lead['LinkedIn'],
        twitter: lead['Twitter'],
      };

      const key = leadDedupeKey(internalLead);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        allLeads.push(internalLead);
      }
    });
    log(`${colors.green}✓ Resumed from Excel: Loaded ${allLeads.length} leads from ${path.basename(filePath)}${colors.reset}`);
  } catch (err) {
    log(`${colors.yellow}⚠ Could not load existing Excel file: ${err.message}${colors.reset}`);
  }
}

// ===== PROGRESS LOGGING =====
const colors = {
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  red: '\x1b[31m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m'
};

function log(msg) {
  const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
  console.log(`${colors.dim}[${time}]${colors.reset} ${msg}`);
}

function logLead(index, total, lead) {
  const emailTag = lead.email
    ? `${colors.green}✓ email${colors.reset}`
    : (lead.website ? `${colors.yellow}no email${colors.reset}` : `${colors.red}no website${colors.reset}`);
  process.stdout.write(
    `\r${colors.dim}[${new Date().toLocaleTimeString('en-IN', { hour12: false })}]${colors.reset} ` +
    `${colors.cyan}[${index}/${total}]${colors.reset} ${lead.name} (${emailTag})` +
    '                    '
  );
}

// ===== BROWSER EXTRACTION (runs inside Playwright page context) =====

/**
 * Extract a lead from a Google Maps detail panel.
 * This function runs inside page.evaluate() — pure DOM access, no Node.js.
 */
function extractDetailPanelScript() {
  return `() => {
    const lead = { name: '', category: '', address: '', phones: [], website: '', rating: '', reviews: '', email: '', googleMapsUrl: window.location.href, facebook: '', instagram: '', linkedin: '', twitter: '' };

    // Name
    const nameEl = document.querySelector('h1.DUwDvf') || document.querySelector('.DUwDvf') || document.querySelector('.fontHeadlineLarge');
    lead.name = nameEl ? nameEl.textContent.trim() : '';

    // Category
    const catEl = document.querySelector('.DkEaL') || document.querySelector('button[jsaction*="category"]');
    lead.category = catEl ? catEl.textContent.trim() : '';

    // Address
    const addrEl = document.querySelector('[data-item-id="address"] .fontBodyMedium') || document.querySelector('button[data-item-id="address"] .fontBodyMedium');
    if (addrEl) lead.address = addrEl.textContent.trim();
    if (!lead.address) {
      for (const btn of document.querySelectorAll('[data-item-id]')) {
        if ((btn.getAttribute('data-item-id') || '').includes('address')) {
          const t = btn.querySelector('.fontBodyMedium') || btn.querySelector('span');
          if (t) { lead.address = t.textContent.trim(); break; }
        }
      }
    }

    // Phones — capture ALL phone numbers (multiple)
    const phoneEls = document.querySelectorAll('[data-item-id*="phone"]');
    for (const el of phoneEls) {
      const txt = (el.querySelector('.fontBodyMedium') || el).textContent.trim();
      if (txt && !lead.phones.includes(txt)) lead.phones.push(txt);
    }
    // Also check tel: links
    const telLinks = document.querySelectorAll('a[href^="tel:"]');
    for (const a of telLinks) {
      const href = (a.getAttribute('href') || '').replace(/^tel:/i, '').trim();
      if (href && !lead.phones.some(p => p.replace(/[^0-9]/g, '') === href.replace(/[^0-9]/g, ''))) {
        lead.phones.push(href);
      }
    }

    // Website
    const siteEl = document.querySelector('a[data-item-id="authority"]') ||
                   document.querySelector('a[href^="http"][aria-label*="website" i]') ||
                   document.querySelector('[data-item-id*="web"] a[href^="http"]');
    if (siteEl) lead.website = siteEl.href;

    // Rating
    const ratingEl = document.querySelector('.F7nice span[aria-hidden="true"]') || document.querySelector('[role="img"][aria-label*="star"]');
    if (ratingEl) lead.rating = ratingEl.textContent.trim() || (ratingEl.getAttribute('aria-label') || '').match(/[0-9.]+/)?.[0] || '';

    // Reviews — fixed regex
    const revEl = document.querySelector('.F7nice span[aria-label*="review"]') || document.querySelector('[aria-label*="reviews"]');
    if (revEl) {
      const rt = revEl.getAttribute('aria-label') || revEl.textContent;
      const rm = rt.match(/([0-9][0-9,]*)/); 
      lead.reviews = rm ? rm[1].replace(/,/g, '') : '';
    }
    // Fallback: try the reviews button text
    if (!lead.reviews) {
      const revBtn = document.querySelector('button[jsaction*="review"]') || document.querySelector('[aria-label*="reviews"]');
      if (revBtn) {
        const rt = revBtn.getAttribute('aria-label') || revBtn.textContent || '';
        const rm = rt.match(/([0-9][0-9,]*)/); 
        if (rm) lead.reviews = rm[1].replace(/,/g, '');
      }
    }

    // Email from panel
    const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
    for (const a of mailtoLinks) {
      const href = (a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
      if (href.includes('@') && href.length < 80) { lead.email = href.toLowerCase(); break; }
    }
    if (!lead.email) {
      for (const el of document.querySelectorAll('[data-item-id*="email"]')) {
        const t = (el.querySelector('.fontBodyMedium') || el).textContent.trim();
        if (t.includes('@')) { lead.email = t.toLowerCase(); break; }
      }
    }

    // Social Media
    const links = document.querySelectorAll('a[href^="http"]');
    for (const a of links) {
      const href = a.href.toLowerCase();
      if (href.includes('facebook.com')) lead.facebook = a.href;
      else if (href.includes('instagram.com')) lead.instagram = a.href;
      else if (href.includes('linkedin.com')) lead.linkedin = a.href;
      else if (href.includes('twitter.com') || href.includes('x.com')) lead.twitter = a.href;
    }

    return lead;
  }`;
}

/**
 * Extract leads from the results list cards (no clicking needed).
 * This runs inside page.evaluate().
 */
function extractCardsScript() {
  return `() => {
    const leads = [];
    const cards = document.querySelectorAll('.Nv2PK');
    
    for (const card of cards) {
      const link = card.querySelector('a.hfpxzc') || card.querySelector('a[href*="/maps/place/"]');
      if (!link || !link.href || !link.href.includes('/maps/place/')) continue;

      const lead = { name: '', category: '', address: '', phones: [], website: '', rating: '', reviews: '', email: '', googleMapsUrl: link.href, facebook: '', instagram: '', linkedin: '', twitter: '' };

      // Name
      const nameEl = card.querySelector('.qBF1Pd') || card.querySelector('.fontHeadlineSmall');
      lead.name = nameEl ? nameEl.textContent.trim() : (link.getAttribute('aria-label') || '').trim();
      if (!lead.name) continue;

      // Rating — fixed regex (no double escaping)
      const rEl = card.querySelector('.MW4etd');
      if (rEl) lead.rating = (rEl.textContent.match(/[0-9.]+/) || [''])[0];

      // Reviews — fixed regex
      const rvEl = card.querySelector('.UY7F9');
      if (rvEl) {
        const rvText = rvEl.textContent.replace(/[()]/g, '').trim();
        const rvMatch = rvText.match(/([0-9][0-9,]*)/);
        lead.reviews = rvMatch ? rvMatch[1].replace(/,/g, '') : '';
      }

      // Category & Address from info lines
      //
      // Google renders each card's info line twice. The visible copy glues the
      // street address to the business description and the hours with no
      // separator - "199 N 8th StUpscale eatery with local, seasonal fareClosed"
      // - and textContent returns that as a single string, so splitting on the
      // separator welds the description onto the address. The second copy omits
      // the description and gives each field its own span, with the address
      // prefixed by the separator: "\u00B7 199 N 8th St". Prefer that span.
      const STREET = /\\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|way|pl|place|cir|circle|pkwy|suite|ste|highway|hwy|rt|route)\\b|,\\s*[A-Z]{2}\\s*\\d{5}/i;
      // Hours text can be glued to the END of the category with no separator -
      // "PlumberOpen 24 hours", "RemodelerClosed" - because the info line is
      // one rendered string and the hours word is capitalized, so the seam is
      // a lowercase letter run straight into a capital hours word. Match that
      // seam and keep the letter; a category merely CONTAINING those letters
      // never matches, because the hours word must be the final run.
      const HOURS_TAIL = /([a-z])\\s*(?:open|closed|opens|closes)(?:\\s*(?:24\\s*hours?|[0-9]{1,2}(?::[0-9]{2})?\\s*(?:am|pm)?|now))*\\s*$/i;
      // A part that is only hours ("Closes 5 pm", "Opens 7 am Mon") or only a
      // phone number still contains digits, so the /[0-9]/ test below alone
      // would accept it as a street address. Reject both.
      const ONLY_HOURS = /^(?:open|closed|opens|closes)?\\s*(?:(?:[0-9]{1,2}(?::[0-9]{2})?\\s*(?:am|pm)?)|24\\s*hours?|now|(?:mon|tues|wed|thu|fri|sat|sun)[a-z]*)(?:\\s+(?:(?:[0-9]{1,2}(?::[0-9]{2})?\\s*(?:am|pm)?)|24\\s*hours?|now|(?:mon|tues|wed|thu|fri|sat|sun)[a-z]*))*\\s*$/i;
      const ONLY_PHONE = /^\\+?[0-9][0-9\\s().-]*$/;
      let fallbackAddr = '';
      for (const b of card.querySelectorAll('.W4Efsd')) {
        const txt = b.textContent.replace(/[\u2022\u00B7\u22C5]/g, '\u00B7').trim();
        if (!txt.includes('\u00B7')) continue;
        const parts = txt.split('\u00B7').map(s => s.trim()).filter(Boolean);
        if (!lead.category && parts[0] && !/^(open|closed|opens|closes)/i.test(parts[0])) lead.category = parts[0].replace(HOURS_TAIL, '$1').trim();
        if (!fallbackAddr) {
          const guess = parts.slice(1).find(p => /[0-9]/.test(p) && !/review|star/i.test(p) && !ONLY_HOURS.test(p) && !ONLY_PHONE.test(p));
          if (guess) fallbackAddr = guess;
        }
        if (!lead.address) {
          for (const sp of b.children) {
            const t = (sp.textContent || '').replace(/[•·⋅]/g, '·').trim();
            if (t.startsWith('\u00B7') && /[0-9]/.test(t) && STREET.test(t) && !/review|star/i.test(t)) {
              lead.address = t.replace(/^\u00B7\\s*/, '').trim();
              break;
            }
          }
        }
        if (lead.category && lead.address) break;
      }
      // Only fall back to the joined-text guess when no block rendered the
      // dedicated address span, so a glued description never wins merely
      // because its block comes first.
      if (!lead.address) lead.address = fallbackAddr;

      // Phones — capture all visible phone numbers
      const phoneSpans = card.querySelectorAll('.UsdlK');
      for (const ps of phoneSpans) {
        const pt = ps.textContent.trim();
        if (pt && !lead.phones.includes(pt)) lead.phones.push(pt);
      }

      // Website from card
      const SKIP = /google\\.|gstatic\\.|\\/maps\\/|facebook\\.com|instagram\\.com|twitter\\.com|linkedin\\.com|youtube\\.com/i;
      const siteEl = card.querySelector('a[data-value="Website"]') || card.querySelector('a.lcr4fd[href]');
      if (siteEl) lead.website = siteEl.href;
      if (!lead.website) {
        for (const a of card.querySelectorAll('a[href^="http"]')) {
          if (!SKIP.test(a.href)) { lead.website = a.href; break; }
        }
      }

      // Social Media
      for (const a of card.querySelectorAll('a[href^="http"]')) {
        const href = a.href.toLowerCase();
        if (href.includes('facebook.com')) lead.facebook = a.href;
        else if (href.includes('instagram.com')) lead.instagram = a.href;
        else if (href.includes('linkedin.com')) lead.linkedin = a.href;
        else if (href.includes('twitter.com') || href.includes('x.com')) lead.twitter = a.href;
      }

      leads.push(lead);
    }
    return leads;
  }`;
}

// ===== MAIN SCRAPER =====

async function scrollToLoadAll(page) {
  log('Scrolling to load all results...');
  let previousCount = 0;
  let noGrowthRounds = 0;

  for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
    // Scroll the feed to bottom
    const currentCount = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      const scroller = feed ? (feed.closest('.m6QErb') || feed) : null;
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
        // Also try last card scrollIntoView
        const cards = document.querySelectorAll('.Nv2PK');
        const last = cards[cards.length - 1];
        if (last) last.scrollIntoView({ behavior: 'auto', block: 'end' });
        // Fire events
        scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 3000, bubbles: true }));
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
      return document.querySelectorAll('.Nv2PK').length;
    });

    process.stdout.write(`\r  Scrolling... found ${currentCount} listings (scroll ${i + 1})    `);

    // Check for end-of-list marker
    const atEnd = await page.evaluate(() => {
      const indicators = document.querySelectorAll('.HlvSq, .PbZDve, [class*="end-of-list"]');
      for (const el of indicators) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0) return true;
      }
      // Text-based check
      const scope = document.querySelector('[role="feed"]') || document;
      const endTexts = scope.querySelectorAll('span, div');
      for (const el of endTexts) {
        const t = (el.textContent || '').toLowerCase().trim();
        if (t === "you've reached the end of the list." || t.includes('end of results')) return true;
      }
      return false;
    });

    if (atEnd) {
      process.stdout.write(`\n`);
      log(`✓ Reached end of list. Found ${currentCount} listings.`);
      break;
    }

    if (currentCount > previousCount) {
      noGrowthRounds = 0;
    } else {
      noGrowthRounds++;
    }

    if (noGrowthRounds >= MAX_SCROLL_NO_GROWTH) {
      process.stdout.write(`\n`);
      log(`✓ No more results loading. Found ${currentCount} total listings.`);
      break;
    }

    // When growth stalls, nudge harder
    if (noGrowthRounds >= 2) {
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        const scroller = feed ? (feed.closest('.m6QErb') || feed) : null;
        if (scroller) {
          scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight - 500);
        }
      });
      await sleep(250);
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        const scroller = feed ? (feed.closest('.m6QErb') || feed) : null;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      });
      await sleep(350);
    }

    previousCount = currentCount;
    await sleep(noGrowthRounds >= 1 ? SCROLL_BOTTOM_DELAY : SCROLL_DELAY);
  }

  process.stdout.write(`\n`);
  await sleep(1000);
}


// Fail fast when a proxy is unreachable, instead of wedging the first query for minutes.
async function checkProxyReachable(proxyUrl) {
  try {
    const u = new URL(proxyUrl);
    const mod = u.protocol === 'https:' ? require('https') : require('http');
    await new Promise((resolve, reject) => {
      const req = mod.request({ host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), method: 'CONNECT', path: 'oauth2.googleapis.com:443', timeout: 4000 }, (res) => { res.destroy(); resolve(); });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('proxy connect timeout')); });
      req.end();
    });
  } catch (e) { throw new Error('Proxy unreachable (' + proxyUrl + '): ' + e.message); }
}
async function scrapeArea(page, keyword, areaName, allLeads, seenKeys) {
  // A campaign query is already qualified ("Restaurants Birmingham Alabama
  // USA"), so appending the label would only distort the search. The label is
  // still recorded on each lead via scrapedFrom below.
  const alreadyHas = areaName && keyword.toLowerCase().includes(areaName.toLowerCase());
  const searchQuery = (areaName && !alreadyHas) ? `${keyword} ${areaName}` : keyword;
  log(`${colors.bold}Searching: "${searchQuery}"${colors.reset}`);

  // Navigate directly via URL — much more reliable than typing into search box
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
  await safeGoto(page, searchUrl);

  // Handle consent dialog if it appears (Google cookie consent)
  try {
    const consentBtn = await page.$('button:has-text("Accept all")') ||
                       await page.$('button:has-text("Accept")') ||
                       await page.$('button:has-text("Reject all")') ||
                       await page.$('form[action*="consent"] button');
    if (consentBtn) {
      await consentBtn.click();
      await sleep(2000);
    }
  } catch (_) {}

  // Wait for results to load — try multiple selectors
  const RESULT_SELECTORS = '.Nv2PK, [role="feed"] a.hfpxzc, .m6QErb a.hfpxzc';
  await sleep(3000);
  try {
    await page.waitForSelector(RESULT_SELECTORS, { timeout: 20000 });
  } catch (e) {
    // Take debug screenshot
    const ssPath = path.join(__dirname, 'output', `debug-${Date.now()}.png`);
    await page.screenshot({ path: ssPath, fullPage: false }).catch(() => {});
    log(`${colors.yellow}⚠ No results found for "${searchQuery}" (screenshot: ${ssPath})${colors.reset}`);
    return;
  }
  await sleep(1500);

  // Scroll to load all results
  await scrollToLoadAll(page);

  // Extract card-level data (always needed — fast, no clicking)
  const startCount = allLeads.length;
  const cardLeads = await page.evaluate(`(${extractCardsScript()})()`);
  log(`Found ${cardLeads.length} listings. Processing...`);

  // QUICK MODE: just use card data + email extraction (no detail panel clicks)
  if (globalOpts.quick) {
    for (let i = 0; i < cardLeads.length; i++) {
      if (globalOpts.limit > 0 && allLeads.length >= globalOpts.limit) break;
      const lead = cardLeads[i];
      if (!lead.name) continue;
      const key = leadDedupeKey(lead);
      if (key && seenKeys.has(key)) continue;

      lead.scrapedFrom = areaName || 'initial';
      lead.website = unwrapGoogleRedirect(lead.website);
      if (lead.website && !lead.email) {
        lead.email = await findEmail(lead.website);
      }
      lead.status = lead.email ? 'Email Found' : (lead.website ? 'No Email' : 'No Website');
      allLeads.push(lead);
      if (key) seenKeys.add(key);
      logLead(allLeads.length, cardLeads.length, lead);
      await sleep(100);
    }
  } else {
    // FULL MODE: click into each card for detailed data
    const cardUrls = cardLeads.map(c => c.googleMapsUrl).filter(Boolean);

    for (let i = 0; i < cardUrls.length; i++) {
      if (globalOpts.limit > 0 && allLeads.length >= globalOpts.limit) break;
      const url = cardUrls[i];
      const key = leadDedupeKey({ googleMapsUrl: url });
      if (key && seenKeys.has(key)) continue;

      const cardLead = cardLeads.find(c => c.googleMapsUrl === url) || { googleMapsUrl: url };

      try {
        // Click the card to open detail panel
        const clicked = await page.evaluate((targetUrl) => {
          const links = document.querySelectorAll('a.hfpxzc');
          for (const l of links) {
            if (l.href === targetUrl) {
              l.scrollIntoView({ block: 'center' });
              l.click();
              return true;
            }
          }
          return false;
        }, url);

        if (!clicked) {
          // Use card data as fallback
          if (cardLead.name) {
            cardLead.scrapedFrom = areaName || 'initial';
            cardLead.website = unwrapGoogleRedirect(cardLead.website);
            if (cardLead.website && !cardLead.email) cardLead.email = await findEmail(cardLead.website);
            cardLead.status = cardLead.email ? 'Email Found' : (cardLead.website ? 'No Email' : 'No Website');
            allLeads.push(cardLead);
            if (key) seenKeys.add(key);
          }
          continue;
        }

        // Wait for detail panel
        await sleep(500);
        try {
          await page.waitForSelector('h1.DUwDvf, .DUwDvf', { timeout: 8000 });
        } catch (_) {
          if (cardLead.name) {
            cardLead.scrapedFrom = areaName || 'initial';
            cardLead.website = unwrapGoogleRedirect(cardLead.website);
            if (cardLead.website && !cardLead.email) cardLead.email = await findEmail(cardLead.website);
            cardLead.status = cardLead.email ? 'Email Found' : (cardLead.website ? 'No Email' : 'No Website');
            allLeads.push(cardLead);
            if (key) seenKeys.add(key);
          }
          continue;
        }
        await sleep(800);

        // Extract from detail panel
        const lead = await page.evaluate(`(${extractDetailPanelScript()})()`);
        lead.scrapedFrom = areaName || 'initial';
        lead.website = unwrapGoogleRedirect(lead.website);
        if (!lead.name && cardLead.name) lead.name = cardLead.name;
        if (!lead.category && cardLead.category) lead.category = cardLead.category;
        if ((!lead.phones || !lead.phones.length) && cardLead.phones && cardLead.phones.length) lead.phones = cardLead.phones;
        if (!lead.address && cardLead.address) lead.address = cardLead.address;

        if (lead.website && !lead.email) lead.email = await findEmail(lead.website);
        lead.status = lead.email ? 'Email Found' : (lead.website ? 'No Email' : 'No Website');

        if (lead.name) {
          const newKey = leadDedupeKey(lead);
          if (!newKey || !seenKeys.has(newKey)) {
            allLeads.push(lead);
            if (newKey) seenKeys.add(newKey);
            logLead(allLeads.length, cardUrls.length, lead);
          }
        }

        // Go back to results list
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(500);
        try { await page.waitForSelector('.Nv2PK', { timeout: 8000 }); }
        catch (_) { await page.goBack().catch(() => {}); await sleep(1000); }
        await sleep(CARD_DELAY);

      } catch (err) {
        if (cardLead.name) {
          cardLead.scrapedFrom = areaName || 'initial';
          cardLead.website = unwrapGoogleRedirect(cardLead.website);
          cardLead.status = cardLead.website ? 'No Email' : 'No Website';
          allLeads.push(cardLead);
          if (key) seenKeys.add(key);
        }
        try { await page.goBack().catch(() => {}); await sleep(500); } catch (_) {}
      }

      // Auto-save periodically
      if (allLeads.length % AUTOSAVE_INTERVAL === 0 && allLeads.length > 0) {
        log(`💾 Auto-saved ${allLeads.length} leads`);
      }
    }
  }

  const areaTotal = allLeads.length - startCount;
  process.stdout.write('\n');
  log(`${colors.green}✓ Area "${areaName || 'initial'}" done: ${areaTotal} new leads (${allLeads.length} total)${colors.reset}`);
}

// ===== GLOBAL STATE =====
let outputPath = '';
let globalOpts = {};

// ===== MAIN =====
async function main() {
  const opts = parseArgs();

  if (!opts.query) {
    console.log(`
${colors.bold}Maps Lead Scraper Agent${colors.reset}
${colors.dim}Standalone Google Maps scraper — fire and forget${colors.reset}

${colors.bold}Usage:${colors.reset}
  node scraper.js "digital marketing mumbai"
  node scraper.js "dentists" --city mumbai
  node scraper.js "cafes" --city mumbai --areas "Andheri,Bandra"
  node scraper.js "plumber delhi" --headed

${colors.bold}Options:${colors.reset}
  --city <name>     City name (auto-detected from query if not set)
  --areas <list>    Comma-separated area names (uses areas.js database if not set)
  --headed          Show the browser window (default: headless)
  --output <path>   Custom output CSV path
`);
    process.exit(0);
  }

  // Detect city and areas from query
  globalOpts = opts;
  const fullQuery = opts.city ? `${opts.query} ${opts.city}` : opts.query;
  let detected = detectCityAndAreas(fullQuery);

  let keyword = opts.query;
  let areas = opts.areas;

  // Campaign mode passes a fully-qualified query ("Restaurants Birmingham
  // Alabama USA") and asks for no area expansion. That expansion is keyed on
  // the city name alone, so "Birmingham" pulls in Digbeth and Selly Oak -
  // neighborhoods of Birmingham, England. Searching the qualified string as a
  // single query keeps Google pinned to the intended place.
  if (opts.noAreas) {
    areas = [];
    detected = null;
    log(`${colors.yellow}Single-search mode (--no-areas): "${opts.query}"${colors.reset}`);
  } else if (detected && !areas.length) {
    const queryLower = opts.query.toLowerCase();
    const cityLower = detected.city.toLowerCase();

    if (queryLower.includes(cityLower)) {
      keyword = detected.keyword || opts.query;
      const cityName = detected.city.charAt(0).toUpperCase() + detected.city.slice(1);
      areas = [cityName, ...detected.areas];
      log(`Detected city: ${colors.bold}${detected.city}${colors.reset} with ${areas.length} areas (including ${cityName} itself)`);
    } else {
      log(`${colors.yellow}Smart detection suggested ${detected.city}, but it doesn't match the query. Using single search instead.${colors.reset}`);
    }
  } else if (!areas.length) {
    log(`${colors.yellow}No city detected. Scraping single search: "${opts.query}"${colors.reset}`);
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const cityRaw = detected ? detected.city : (opts.city || '');
  const cityClean = cityRaw ? cityRaw.charAt(0).toUpperCase() + cityRaw.slice(1) : '';
  const kwClean = keyword ? keyword.charAt(0).toUpperCase() + keyword.slice(1) : 'Leads';

  const cleanFileName = cityClean
    ? `${cityClean} ${kwClean.endsWith('s') ? kwClean : kwClean + 's'} Leads.xlsx`.replace(/\s+/g, ' ').replace(/Leads Leads/g, 'Leads')
    : `${kwClean} Leads ${timestamp}.xlsx`;

  outputPath = opts.output || path.join(__dirname, 'output', cleanFileName);

  log(`${colors.bold}=== Maps Lead Scraper Agent ===${colors.reset}`);
  log(`Query: "${keyword}"`);
  log(`Areas: ${areas.length > 0 ? areas.join(', ') : '(single search)'}`);
  log(`Output: ${outputPath}`);
  log(`Mode: ${opts.headed ? 'Visible browser' : 'Headless (background)'}`);
  console.log('');

  const allLeads = [];
  const seenKeys = new Set();
  await loadExistingXlsx(outputPath, allLeads, seenKeys);

  // Proxy Rotation Setup
  const proxies = opts.proxy ? opts.proxy.split(',').map(p => p.trim()) : [];
  let proxyIdx = 0;

  // Hoisted out of the try so the catch below can reach it: a throw while the
  // browser is open must close it, otherwise the process lingers as a zombie
  // child and the queue - which advances on the child's close event - stalls
  // forever. This is what wedged the queue for ~3h on the Edmond run.
  let browser = null;
  try {
    if (areas.length > 0) {
      log(`${colors.bold}Starting multi-area scrape: ${areas.length} areas${colors.reset}`);
      console.log('');

      for (let i = 0; i < areas.length; i++) {
        const area = areas[i];
        const currentProxy = proxies.length > 0 ? proxies[proxyIdx % proxies.length] : null;

        log(`${colors.cyan}[${i + 1}/${areas.length}]${colors.reset} Area: ${colors.bold}${area}${colors.reset}`);
        if (currentProxy) {
            log(`${colors.dim}Using proxy: ${currentProxy}${colors.reset}`);
            if (proxyIdx === 0) { try { await checkProxyReachable(currentProxy); } catch(e){ console.error(e.message); process.exit(2); } }
        }

        // Launch fresh browser for each area to rotate proxy and clear session
        browser = await launchBrowser(currentProxy, opts.headed);
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          locale: 'en-US',
          viewport: { width: 1280, height: 900 },
        });
        const page = await context.newPage();

        // Block unnecessary resources
        await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf}', route => route.abort());
        await page.route('**/maps/vt/**', route => route.abort());
        await page.route('**/maps/api/js/ViewportInfoService**', route => route.abort());

        await scrapeArea(page, keyword, area, allLeads, seenKeys);

        await browser.close();
        proxyIdx++;

        if (i < areas.length - 1) {
          const pause = rand(AREA_PAUSE_MIN, AREA_PAUSE_MAX);
          log(`${colors.dim}Pausing ${(pause / 1000).toFixed(1)}s before next area...${colors.reset}`);
          await sleep(pause);
        }
      }
    } else {
      // The qualified campaign query already names the city, so it goes to
      // scrapeArea as the label only - scrapeArea will not append it again.
      const finalArea = opts.areaLabel || opts.city || '';
      const currentProxy = proxies.length > 0 ? proxies[0] : null;
      if (currentProxy) { try { await checkProxyReachable(currentProxy); } catch(e){ console.error(e.message); process.exit(2); } }
      browser = await launchBrowser(currentProxy, opts.headed);
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf}', route => route.abort());
      await page.route('**/maps/vt/**', route => route.abort());
      await page.route('**/maps/api/js/ViewportInfoService**', route => route.abort());

      await scrapeArea(page, keyword, finalArea, allLeads, seenKeys);
      await browser.close();
    }

    await saveExcel(allLeads, outputPath);
    console.log('');
    log(`${colors.bold}${colors.green}========================================${colors.reset}`);
    log(`${colors.bold}${colors.green}  DONE! ${allLeads.length} leads scraped${colors.reset}`);
    log(`${colors.bold}${colors.green}  Emails found: ${allLeads.filter(l => l.email).length}${colors.reset}`);
    log(`${colors.bold}${colors.green}  Saved to: ${outputPath}${colors.reset}`);
    log(`${colors.bold}${colors.green}========================================${colors.reset}`);

  } catch (err) {
    console.error(`\n${colors.red}Error: ${err.message}${colors.reset}`);
    if (allLeads.length > 0) {
      saveCSVQuick(allLeads, outputPath.replace(/\.xlsx$/i, '-partial.csv'));
      log(`${colors.yellow}Saved ${allLeads.length} leads collected before error${colors.reset}`);
    }
    // Force-exit so the queue advances. Previously this catch fell off the end
    // of main() with the browser still open: the child never emitted 'close',
    // so server.js's queue stalled and the run looked busy while doing nothing.
    // Race the close against a timeout - the browser may be the wedged thing
    // that caused the error, and a hanging close() would reintroduce the stall.
    if (browser) {
      await Promise.race([
        browser.close().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
    process.exit(1);
  }
}

async function launchBrowser(proxy, headed) {
  const launchOpts = {
    headless: !headed,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--lang=en-US',
    ]
  };
  if (proxy) {
    launchOpts.args.push(`--proxy-server=${proxy}`);
  }
  return await chromium.launch(launchOpts);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});;
