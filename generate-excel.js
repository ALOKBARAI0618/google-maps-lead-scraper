/**
 * generate-excel.js
 * Converts CSV lead data into a professional, themed Excel workbook
 * with CRM tracking columns and dropdown validations.
 *
 * Usage:
 *   node generate-excel.js                           # auto-detect latest CSV
 *   node generate-excel.js path/to/leads.csv         # specific CSV
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// ===== CONFIGURATION =====
// You can add/remove/rename any CRM column here and it will appear in the Excel
const CRM_COLUMNS = [
  { header: 'Call',                key: 'call',       width: 14, options: ['Yes', 'No', 'Pending', 'Yes (After This Week)'] },
  { header: 'Not Call',            key: 'notCall',    width: 14, options: ['Yes', 'No', 'Pending'] },
  { header: 'Asking for Detailed', key: 'detailed',   width: 20, options: ['Yes', 'No', 'Pending', 'Sent'] },
  { header: 'Directly Rejected',   key: 'rejected',   width: 20, options: ['Yes', 'No'] },
  { header: 'Asking for Demo',     key: 'demo',       width: 20, options: ['Yes', 'No', 'Pending', 'Scheduled'] },
  { header: 'Follow Up Date',      key: 'followUp',   width: 16, options: null },  // free text
  { header: 'Notes',               key: 'notes',      width: 30, options: null },  // free text
];

// ===== COLOR PALETTE =====
const COLORS = {
  headerBg:     'FF1F4E79',   // dark navy blue
  headerFont:   'FFFFFFFF',   // white
  headerBorder: 'FF0D3B66',
  evenRow:      'FFDCE6F1',   // light blue-gray
  oddRow:       'FFFFFFFF',   // white
  trackingBg:   'FFFFFDE7',   // light yellow
  border:       'FFBFCFE0',
  greenText:    'FF217346',
  yellowText:   'FFBF8F00',
  redText:      'FFCC3300',
  linkText:     'FF0563C1',
};

// ===== CSV PARSER =====
function parseCSV(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8').replace(/^\ufeff/, '');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length <= 1) return [];

  // Simple CSV parse handling quoted fields
  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
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

  const headers = parseLine(lines[0]);
  const leads = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length < 2 || !cols[1]) continue;

    leads.push({
      name:        cols[headers.indexOf('Name')]     || cols[1] || '',
      category:    cols[headers.indexOf('Category')] || cols[2] || '',
      address:     cols[headers.indexOf('Address')]  || cols[3] || '',
      rating:      cols[headers.indexOf('Rating')]   || cols[4] || '',
      reviews:     cols[headers.indexOf('Reviews')]  || cols[5] || '',
      email:       cols[headers.indexOf('Email')]    || cols[6] || '',
      area:        cols[headers.indexOf('Area')]     || cols[7] || '',
      status:      cols[headers.indexOf('Status')]   || cols[8] || '',
      phone1:      cols[headers.indexOf('Phone 1')]  || cols[9] || '',
      phone2:      cols[headers.indexOf('Phone 2')]  || cols[10] || '',
      phone3:      cols[headers.indexOf('Phone 3')]  || cols[11] || '',
      website:     cols[headers.indexOf('Website')]  || cols[12] || '',
      googleMapsUrl: cols[headers.indexOf('Google Maps URL')] || '',
    });
  }

  return leads;
}

// ===== EXCEL GENERATOR =====
async function generateExcel(leads, outputPath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maps Lead Scraper Agent';
  wb.created = new Date();

  const ws = wb.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],   // freeze header row + S.No & Name columns
    properties: { defaultRowHeight: 22 },
  });

  // ===== DATA COLUMNS =====
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
    { header: 'Phone 1',         key: 'phone1',   width: 18 },
    { header: 'Phone 2',         key: 'phone2',   width: 18 },
    { header: 'Phone 3',         key: 'phone3',   width: 18 },
    { header: 'Website',         key: 'website',  width: 28 },
  ];

  // Merge data + CRM columns
  ws.columns = [...dataColumns, ...CRM_COLUMNS.map(c => ({ header: c.header, key: c.key, width: c.width }))];

  // ===== HEADER STYLING =====
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.font = { bold: true, color: { argb: COLORS.headerFont }, size: 11, name: 'Calibri' };
    cell.border = {
      top:    { style: 'medium', color: { argb: COLORS.headerBorder } },
      bottom: { style: 'medium', color: { argb: COLORS.headerBorder } },
      left:   { style: 'thin',   color: { argb: COLORS.headerBorder } },
      right:  { style: 'thin',   color: { argb: COLORS.headerBorder } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  // CRM header columns get a different color (dark teal)
  const crmStartCol = dataColumns.length + 1;
  for (let c = crmStartCol; c <= ws.columns.length; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E4D45' } };
  }

  // ===== DATA ROWS =====
  const cellFont = { size: 10, name: 'Calibri' };
  const cellBorder = {
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right:  { style: 'thin', color: { argb: COLORS.border } },
    left:   { style: 'thin', color: { argb: COLORS.border } },
  };

  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    const rowData = {
      sno:      i + 1,
      name:     l.name,
      category: l.category,
      address:  l.address,
      rating:   l.rating,
      reviews:  l.reviews,
      email:    l.email,
      mapsUrl:  l.googleMapsUrl || '',
      area:     l.area,
      status:   l.status,
      phone1:   l.phone1,
      phone2:   l.phone2,
      phone3:   l.phone3,
      website:  l.website,
    };
    // Init CRM columns as empty
    for (const crm of CRM_COLUMNS) rowData[crm.key] = '';

    const row = ws.addRow(rowData);

    // Alternating row colors
    const fill = i % 2 === 0
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.evenRow } }
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.oddRow } };

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = fill;
      cell.border = cellBorder;
      cell.font = { ...cellFont };
      cell.alignment = { vertical: 'middle', wrapText: false };
    });
    row.height = 22;

    // --- Google Maps URL hyperlink ---
    const urlCell = row.getCell('mapsUrl');
    if (l.googleMapsUrl && l.googleMapsUrl.startsWith('http')) {
      urlCell.value = { text: 'Open Map 📍', hyperlink: l.googleMapsUrl };
      urlCell.font = { ...cellFont, color: { argb: COLORS.linkText }, underline: true };
    }

    // --- Website hyperlink ---
    const webCell = row.getCell('website');
    if (l.website && l.website.startsWith('http')) {
      const shortUrl = l.website.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
      webCell.value = { text: shortUrl, hyperlink: l.website };
      webCell.font = { ...cellFont, color: { argb: COLORS.linkText }, underline: true };
    }

    // --- Status color ---
    const statusCell = row.getCell('status');
    if (l.status === 'Email Found' || l.status?.includes('Email')) {
      statusCell.font = { ...cellFont, bold: true, color: { argb: COLORS.greenText } };
    } else if (l.status === 'No Email') {
      statusCell.font = { ...cellFont, color: { argb: COLORS.yellowText } };
    } else {
      statusCell.font = { ...cellFont, color: { argb: COLORS.redText } };
    }

    // --- Rating bold ---
    const ratingCell = row.getCell('rating');
    ratingCell.font = { ...cellFont, bold: true };
    ratingCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // --- Reviews center ---
    const revCell = row.getCell('reviews');
    revCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // --- S.No center ---
    row.getCell('sno').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('sno').font = { ...cellFont, bold: true, color: { argb: 'FF555555' } };

    // --- CRM columns: light yellow background ---
    for (let c = crmStartCol; c <= ws.columns.length; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.trackingBg } };
    }
  }

  // ===== DROPDOWN VALIDATIONS for CRM columns =====
  const lastDataRow = leads.length + 1;
  for (const crm of CRM_COLUMNS) {
    if (!crm.options) continue; // skip free-text columns
    const colNum = ws.getColumn(crm.key).number;
    for (let r = 2; r <= lastDataRow; r++) {
      ws.getCell(r, colNum).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${crm.options.join(',')}"`],
        showDropDown: true,
      };
    }
  }

  // ===== AUTO-FILTER =====
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: ws.columns.length },
  };

  // ===== CONDITIONAL FORMATTING — highlight rows with email =====
  // (Green left border on rows that have emails)
  // ExcelJS doesn't support row-level conditional formatting easily,
  // so we used cell-level status coloring above instead.

  // ===== SAVE =====
  await wb.xlsx.writeFile(outputPath);
  console.log(`\n✅ Professional Excel generated: ${outputPath}`);
  console.log(`   📊 ${leads.length} leads | ${CRM_COLUMNS.length} CRM tracking columns`);
  console.log(`   📋 Columns: ${ws.columns.map(c => c.header).join(', ')}`);
}

// ===== MAIN =====
async function main() {
  // Find CSV file
  let csvPath = process.argv[2];
  if (!csvPath) {
    const outputDir = path.join(__dirname, 'output');
    const files = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.csv'))
      .sort((a, b) => fs.statSync(path.join(outputDir, b)).mtimeMs - fs.statSync(path.join(outputDir, a)).mtimeMs);
    if (files.length === 0) { console.error('No CSV files found in output/'); process.exit(1); }
    csvPath = path.join(outputDir, files[0]);
    console.log(`Auto-detected CSV: ${csvPath}`);
  }

  // Parse
  const leads = parseCSV(csvPath);
  console.log(`Parsed ${leads.length} leads from CSV`);

  if (leads.length === 0) { console.error('No leads found!'); process.exit(1); }

  // Generate Excel
  const xlsxPath = csvPath.replace(/(-partial)?\.csv$/i, '.xlsx');
  await generateExcel(leads, xlsxPath);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
