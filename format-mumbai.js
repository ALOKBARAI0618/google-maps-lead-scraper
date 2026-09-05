/**
 * format-mumbai.js
 * Converts CSV leads export into a themed, professional Excel workbook.
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const CSV_INPUT_PATH = path.join(__dirname, 'output', 'Mumbai data.csv');
const XLSX_OUTPUT_PROJECT = path.join(__dirname, 'output', 'Mumbai data.xlsx');

// Configuration: 7 CRM columns
const CRM_COLUMNS = [
  { header: 'Call',                        key: 'call',       width: 14, options: ['Yes', 'No', 'Pending', 'Yes (After This Week)'] },
  { header: 'Not Call',                    key: 'notCall',    width: 13, options: ['Yes', 'No', 'Pending'] },
  { header: 'Asking for Detailed',         key: 'detailed',   width: 20, options: ['Yes', 'No', 'Pending', 'Sent'] },
  { header: 'Directly Rejected',           key: 'rejected',   width: 15, options: ['Yes', 'No'] },
  { header: 'Follow Up Date',              key: 'followUp',   width: 16, options: null },
  { header: 'What was discussed on call?', key: 'discussed',  width: 32, options: null },
  { header: 'Notes',                       key: 'notes',      width: 30, options: null },
];

const COLORS = {
  headerBg:     'FF1F4E79', // Dark navy blue
  crmHeaderBg:  'FF0E4D45', // Dark teal
  headerFont:   'FFFFFFFF', // White
  headerBorder: 'FF0D3B66',
  evenRow:      'FFDCE6F1', // Light blue-gray
  oddRow:       'FFFFFFFF', // White
  trackingBg:   'FFFFFDE7', // Light yellow
  border:       'FFBFCFE0', // Soft border blue
  linkText:     'FF0563C1',
};

const JUNK_WEBSITE_REGEX = /^(https?:\/\/)?(www\.)?(facebook\.com|fb\.com|fb\.me|instagram\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|linkedin\.com|bit\.ly|tinyurl\.com|goo\.gl|null\.com|undefined|justdial\.com|indiamart\.com|tradeindia\.com|magicbricks\.com|99acres\.com|housing\.com|nobroker\.in|sulekha\.com|google\.com|business\.site)/i;

function isRealWebsite(url) {
  if (!url || typeof url !== 'string') return false;
  const cleaned = url.trim().toLowerCase();
  if (!cleaned || cleaned === 'no website' || cleaned === 'null' || cleaned.length < 5) return false;
  if (JUNK_WEBSITE_REGEX.test(cleaned)) return false;
  return true;
}

function hasPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7;
}

function parseCSV(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = buffer.toString('utf-8');

  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length <= 1) return [];

  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map(h => h.replace(/^["']|["']$/g, '').trim());

  const getIdx = (name) => headers.indexOf(name);
  const nameIdx = getIdx('Name');
  const catIdx = getIdx('Category');
  const phoneIdx = getIdx('Phone');
  const webIdx = getIdx('Website');
  const emailIdx = getIdx('Email');
  const ratingIdx = getIdx('Rating');
  const reviewsIdx = getIdx('Reviews');
  const areaIdx = getIdx('Scraped From');
  const mapsIdx = getIdx('Google Maps URL');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length < 2) continue;

    let cleanName = (cols[nameIdx] || '')
      .replace(/\ufffd+/g, '')
      .replace(/ï¿½+/g, '')
      .trim();

    let area = cols[areaIdx] || '';
    if (area && area === area.toLowerCase()) {
      area = area.charAt(0).toUpperCase() + area.slice(1);
    }

    let reviews = cols[reviewsIdx] || '';
    if (reviews.endsWith('.0')) {
      reviews = reviews.slice(0, -2);
    }

    rows.push({
      name: cleanName,
      category: cols[catIdx] || '',
      rating: cols[ratingIdx] || '',
      reviews: reviews,
      email: cols[emailIdx] || '',
      googleMapsUrl: cols[mapsIdx] || '',
      area: area,
      phone: cols[phoneIdx] || '',
      website: cols[webIdx] || '',
    });
  }

  return rows;
}

async function buildThemedExcel(leads, outputPaths) {
  console.log(`Building updated themed Excel for ${leads.length} leads...`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maps Lead Scraper Agent';
  wb.created = new Date();

  const ws = wb.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
    properties: { defaultRowHeight: 22 },
  });

  // Target data columns (Address, Status, Lead Type, Phone 2, Phone 3 removed)
  const dataColumns = [
    { header: 'S.No',            key: 'sno',      width: 7  },
    { header: 'Name',            key: 'name',     width: 32 },
    { header: 'Category',        key: 'category', width: 26 },
    { header: 'Rating',          key: 'rating',   width: 13 },
    { header: 'Reviews',         key: 'reviews',  width: 10 },
    { header: 'Email',           key: 'email',    width: 30 },
    { header: 'Google Maps URL', key: 'mapsUrl',  width: 18 },
    { header: 'Area',            key: 'area',     width: 16 },
    { header: 'Phone 1',         key: 'phone1',   width: 18 },
    { header: 'Website',         key: 'website',  width: 28 },
  ];

  ws.columns = [
    ...dataColumns,
    ...CRM_COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width })),
  ];

  // Header row formatting
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  const crmStartCol = dataColumns.length + 1; // Col 11

  headerRow.eachCell((cell, colNumber) => {
    const isCrm = colNumber >= crmStartCol;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isCrm ? COLORS.crmHeaderBg : COLORS.headerBg },
    };
    cell.font = { bold: true, color: { argb: COLORS.headerFont }, size: 11, name: 'Calibri' };
    cell.border = {
      top:    { style: 'medium', color: { argb: COLORS.headerBorder } },
      bottom: { style: 'medium', color: { argb: COLORS.headerBorder } },
      left:   { style: 'thin',   color: { argb: COLORS.headerBorder } },
      right:  { style: 'thin',   color: { argb: COLORS.headerBorder } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  const cellFont = { size: 10, name: 'Calibri' };
  const cellBorder = {
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right:  { style: 'thin', color: { argb: COLORS.border } },
    left:   { style: 'thin', color: { argb: COLORS.border } },
  };

  let counts = {
    hotTarget: 0,
    hasWebsite: 0,
    noPhone: 0,
  };

  // Add data rows
  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    const isEven = i % 2 === 0;
    const baseFill = isEven
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.evenRow } }
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.oddRow } };

    const validPhone = hasPhone(l.phone);
    const realSite = isRealWebsite(l.website);

    if (!validPhone) {
      counts.noPhone++;
    } else if (!realSite) {
      counts.hotTarget++;
    } else {
      counts.hasWebsite++;
    }

    const rowData = {
      sno:      i + 1,
      name:     l.name,
      category: l.category,
      rating:   l.rating,
      reviews:  l.reviews,
      email:    l.email,
      mapsUrl:  l.googleMapsUrl || '',
      area:     l.area,
      phone1:   l.phone,
      website:  l.website,
      call:      '',
      notCall:   '',
      detailed:  '',
      rejected:  '',
      followUp:  '',
      discussed: '',
      notes:     '',
    };

    const row = ws.addRow(rowData);
    row.height = 22;

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = baseFill;
      cell.border = cellBorder;
      cell.font = { ...cellFont };
      cell.alignment = { vertical: 'middle', wrapText: false };
    });

    // Col 1: S.No (Center, bold gray)
    const snoCell = row.getCell('sno');
    snoCell.alignment = { vertical: 'middle', horizontal: 'center' };
    snoCell.font = { ...cellFont, bold: true, color: { argb: 'FF555555' } };

    // Col 4: Rating (Center, bold)
    const ratingCell = row.getCell('rating');
    ratingCell.alignment = { vertical: 'middle', horizontal: 'center' };
    ratingCell.font = { ...cellFont, bold: true };

    // Col 5: Reviews (Center)
    const reviewsCell = row.getCell('reviews');
    reviewsCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Col 7: Google Maps URL Hyperlink
    const mapsCell = row.getCell('mapsUrl');
    if (l.googleMapsUrl && l.googleMapsUrl.startsWith('http')) {
      mapsCell.value = { text: 'Open Map 📍', hyperlink: l.googleMapsUrl };
      mapsCell.font = { ...cellFont, color: { argb: COLORS.linkText }, underline: true };
    }

    // Col 10: Website Hyperlink
    const webCell = row.getCell('website');
    if (l.website && l.website.startsWith('http')) {
      const shortUrl = l.website.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
      webCell.value = { text: shortUrl, hyperlink: l.website };
      webCell.font = { ...cellFont, color: { argb: COLORS.linkText }, underline: true };
    } else if (l.website) {
      webCell.value = l.website;
    }

    // Col 11-16: CRM Columns (Light yellow background)
    for (let c = crmStartCol; c <= ws.columns.length; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.trackingBg } };
    }
  }

  const lastDataRow = leads.length + 1;

  // Dropdown validations for CRM columns
  for (const crm of CRM_COLUMNS) {
    if (!crm.options) continue;
    const colNum = ws.getColumn(crm.key).number;
    const formulaStr = `"${crm.options.join(',')}"`;
    for (let r = 2; r <= lastDataRow; r++) {
      ws.getCell(r, colNum).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formulaStr],
        showDropDown: true,
      };
    }
  }

  // Summary stats block at bottom
  const totalLeads = counts.hotTarget + counts.hasWebsite + counts.noPhone;
  let currRow = lastDataRow + 2; // Spacer row

  function addSummaryRow(label, count, fontColor, bgColor) {
    const row = ws.getRow(currRow);
    row.height = 22;

    const labelCell = row.getCell(9); // Col 9 (Phone 1)
    labelCell.value = label;
    labelCell.font = { bold: true, size: 11, name: 'Calibri', color: { argb: fontColor } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'right' };
    labelCell.border = {
      bottom: { style: 'thin', color: { argb: COLORS.border } },
      top:    { style: 'thin', color: { argb: COLORS.border } },
      left:   { style: 'thin', color: { argb: COLORS.border } },
      right:  { style: 'thin', color: { argb: COLORS.border } },
    };

    const countCell = row.getCell(10); // Col 10 (Website)
    countCell.value = count;
    countCell.font = { bold: true, size: 12, name: 'Calibri', color: { argb: fontColor } };
    countCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    countCell.alignment = { vertical: 'middle', horizontal: 'center' };
    countCell.border = {
      bottom: { style: 'thin', color: { argb: COLORS.border } },
      top:    { style: 'thin', color: { argb: COLORS.border } },
      left:   { style: 'thin', color: { argb: COLORS.border } },
      right:  { style: 'thin', color: { argb: COLORS.border } },
    };

    currRow++;
  }

  addSummaryRow('🟢 Total Hot Call Targets (Phone ✅, Site ❌)', counts.hotTarget, 'FF006100', 'FFC6EFCE');
  addSummaryRow('🔵 Total Has Real Website (Phone ✅, Site ✅)', counts.hasWebsite, 'FF002060', 'FFDDEBF7');
  addSummaryRow('🔴 Total No Phone (Cannot Call)', counts.noPhone, 'FF888888', 'FFEEEEEE');
  addSummaryRow('📊 GRAND TOTAL LEADS', totalLeads, 'FF1F4E79', 'FFE6EEF8');

  // Auto-filter covering data rows
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: lastDataRow, column: ws.columns.length },
  };

  // Save to each output path
  for (const outPath of outputPaths) {
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await wb.xlsx.writeFile(outPath);
    console.log(`Saved workbook to: ${outPath}`);
  }

  console.log('Summary:');
  console.log(`  🟢 Hot Call Targets: ${counts.hotTarget}`);
  console.log(`  🔵 Has Real Website: ${counts.hasWebsite}`);
  console.log(`  🔴 No Phone:         ${counts.noPhone}`);
  console.log(`  📊 Total:            ${totalLeads}`);
}

async function main() {
  const leads = parseCSV(CSV_INPUT_PATH);
  console.log(`Parsed ${leads.length} rows from CSV`);
  if (leads.length === 0) {
    console.error('No leads found in CSV!');
    process.exit(1);
  }

  await buildThemedExcel(leads, [XLSX_OUTPUT_DOWNLOADS, XLSX_OUTPUT_PROJECT]);
  console.log('\nAll done!');
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
