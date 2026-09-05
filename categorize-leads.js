const ExcelJS = require('exceljs');
const path = require('path');

const targetFile = path.join(__dirname, 'output', 'sample-leads.xlsx');

// Junk / Non-independent website patterns
const JUNK_WEBSITE_REGEX = /^(https?:\/\/)?(www\.)?(facebook\.com|fb\.com|fb\.me|instagram\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|linkedin\.com|bit\.ly|tinyurl\.com|goo\.gl|null\.com|undefined|justdial\.com|indiamart\.com|tradeindia\.com|magicbricks\.com|99acres\.com|housing\.com|nobroker\.in|sulekha\.com|google\.com|business\.site)/i;

function isRealWebsite(url) {
  if (!url || typeof url !== 'string') return false;
  const cleaned = url.trim().toLowerCase();
  if (!cleaned || cleaned === 'no website' || cleaned === 'null' || cleaned.length < 5) return false;
  if (JUNK_WEBSITE_REGEX.test(cleaned)) return false;
  return true;
}

function hasPhone(lead) {
  const p1 = String(lead.phone1 || '').replace(/\D/g, '');
  const p2 = String(lead.phone2 || '').replace(/\D/g, '');
  const p3 = String(lead.phone3 || '').replace(/\D/g, '');
  return p1.length >= 7 || p2.length >= 7 || p3.length >= 7;
}

async function categorize() {
  console.log(`Processing ONLY: ${targetFile}`);
  
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(targetFile);
  const ws = wb.getWorksheet('Leads');

  if (!ws) {
    console.error('Worksheet "Leads" not found!');
    return;
  }

  // Find column indexes from Row 1
  const headerRow = ws.getRow(1);
  let websiteCol = -1;
  let phone1Col = -1;
  let phone2Col = -1;
  let phone3Col = -1;
  let statusCol = -1;
  let leadTypeCol = -1;

  headerRow.eachCell((cell, colNum) => {
    const val = String(cell.value || '').trim();
    if (val === 'Website') websiteCol = colNum;
    if (val === 'Phone 1') phone1Col = colNum;
    if (val === 'Phone 2') phone2Col = colNum;
    if (val === 'Phone 3') phone3Col = colNum;
    if (val === 'Status') statusCol = colNum;
    if (val === 'Lead Type') leadTypeCol = colNum;
  });

  // If "Lead Type" doesn't exist yet, insert it
  if (leadTypeCol === -1) {
    const insertColNum = statusCol > 0 ? statusCol + 1 : 11;
    ws.spliceColumns(insertColNum, 0, ['Lead Type']);
    leadTypeCol = insertColNum;
    ws.getColumn(leadTypeCol).width = 24;

    const newHeaderCell = ws.getCell(1, leadTypeCol);
    newHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D3B66' } };
    newHeaderCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    newHeaderCell.border = {
      top: { style: 'medium', color: { argb: 'FF0D3B66' } }, bottom: { style: 'medium', color: { argb: 'FF0D3B66' } },
      left: { style: 'thin', color: { argb: 'FF0D3B66' } }, right: { style: 'thin', color: { argb: 'FF0D3B66' } },
    };
    newHeaderCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }

  // Re-verify columns
  const updatedHeaderRow = ws.getRow(1);
  updatedHeaderRow.eachCell((cell, colNum) => {
    const val = String(cell.value || '').trim();
    if (val === 'Website') websiteCol = colNum;
    if (val === 'Phone 1') phone1Col = colNum;
    if (val === 'Phone 2') phone2Col = colNum;
    if (val === 'Phone 3') phone3Col = colNum;
  });

  let counts = {
    hotTarget: 0,
    hasWebsite: 0,
    noPhone: 0,
    junkWebsitesCount: 0
  };

  // Find last data row (skip existing summary rows if re-run)
  let lastDataRow = 1;
  for (let r = 2; r <= ws.rowCount; r++) {
    const snoVal = ws.getCell(r, 1).value;
    if (typeof snoVal === 'number' || (typeof snoVal === 'string' && /^\d+$/.test(snoVal))) {
      lastDataRow = r;
    }
  }

  for (let r = 2; r <= lastDataRow; r++) {
    const row = ws.getRow(r);
    
    // Extract website URL
    const webCell = row.getCell(websiteCol);
    let webVal = '';
    if (webCell.value) {
      if (typeof webCell.value === 'object' && webCell.value.hyperlink) {
        webVal = webCell.value.hyperlink;
      } else if (typeof webCell.value === 'object' && webCell.value.text) {
        webVal = webCell.value.text;
      } else {
        webVal = String(webCell.value);
      }
    }

    const p1 = row.getCell(phone1Col).value || '';
    const p2 = row.getCell(phone2Col).value || '';
    const p3 = row.getCell(phone3Col).value || '';
    const lead = { phone1: p1, phone2: p2, phone3: p3 };

    const validPhone = hasPhone(lead);
    const realSite = isRealWebsite(webVal);
    const isJunkSite = webVal && !realSite && webVal.trim().toLowerCase() !== 'no website';

    let leadType = '';
    let cellFill = null;
    let cellFont = { size: 10, name: 'Calibri', bold: true };

    if (!validPhone) {
      leadType = '🔴 NO PHONE';
      counts.noPhone++;
      cellFont.color = { argb: 'FF888888' };
      cellFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    } else if (!realSite) {
      leadType = '🟢 HOT CALL TARGET';
      counts.hotTarget++;
      if (isJunkSite) counts.junkWebsitesCount++;
      cellFont.color = { argb: 'FF006100' };
      cellFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
    } else {
      leadType = '🔵 HAS REAL WEBSITE';
      counts.hasWebsite++;
      cellFont.color = { argb: 'FF002060' };
      cellFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    }

    const targetCell = row.getCell(leadTypeCol);
    targetCell.value = leadType;
    targetCell.fill = cellFill;
    targetCell.font = cellFont;
    targetCell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  // --- ADD SUMMARY TOTALS AT BOTTOM ---
  const totalLeads = counts.hotTarget + counts.hasWebsite + counts.noPhone;

  // Clear any existing summary rows after lastDataRow
  const totalRowsNow = ws.rowCount;
  if (totalRowsNow > lastDataRow) {
    for (let r = lastDataRow + 1; r <= totalRowsNow + 10; r++) {
      const row = ws.getRow(r);
      row.eachCell({ includeEmpty: true }, cell => { cell.value = null; cell.fill = null; cell.border = null; });
    }
  }

  // Row 1: Spacer
  let currRow = lastDataRow + 2;

  // Row 2: Header
  const summaryHeaderRow = ws.getRow(currRow);
  summaryHeaderRow.height = 24;
  summaryHeaderRow.getCell(leadTypeCol - 1).value = '--- LEAD SUMMARY STATS ---';
  summaryHeaderRow.getCell(leadTypeCol - 1).font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FFFFFFFF' } };
  summaryHeaderRow.getCell(leadTypeCol - 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  summaryHeaderRow.getCell(leadTypeCol - 1).alignment = { vertical: 'middle', horizontal: 'right' };
  
  summaryHeaderRow.getCell(leadTypeCol).value = 'TOTAL COUNT';
  summaryHeaderRow.getCell(leadTypeCol).font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FFFFFFFF' } };
  summaryHeaderRow.getCell(leadTypeCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  summaryHeaderRow.getCell(leadTypeCol).alignment = { vertical: 'middle', horizontal: 'center' };
  currRow++;

  // Helper for summary data rows
  function addSummaryRow(label, count, fontColor, bgColor) {
    const row = ws.getRow(currRow);
    row.height = 22;
    
    const labelCell = row.getCell(leadTypeCol - 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 11, name: 'Calibri', color: { argb: fontColor } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'right' };
    labelCell.border = { bottom: { style: 'thin', color: { argb: 'FFBFCFE0' } }, top: { style: 'thin', color: { argb: 'FFBFCFE0' } } };

    const countCell = row.getCell(leadTypeCol);
    countCell.value = count;
    countCell.font = { bold: true, size: 12, name: 'Calibri', color: { argb: fontColor } };
    countCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    countCell.alignment = { vertical: 'middle', horizontal: 'center' };
    countCell.border = { bottom: { style: 'thin', color: { argb: 'FFBFCFE0' } }, top: { style: 'thin', color: { argb: 'FFBFCFE0' } } };

    currRow++;
  }

  addSummaryRow('🟢 Total Hot Call Targets (Phone ✅, Site ❌)', counts.hotTarget, 'FF006100', 'FFC6EFCE');
  addSummaryRow('🔵 Total Has Real Website (Phone ✅, Site ✅)', counts.hasWebsite, 'FF002060', 'FFDDEBF7');
  addSummaryRow('🔴 Total No Phone (Cannot Call)', counts.noPhone, 'FF888888', 'FFEEEEEE');
  addSummaryRow('📊 GRAND TOTAL LEADS', totalLeads, 'FF1F4E79', 'FFE6EEF8');

  // Auto filter range up to data rows only
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastDataRow, column: ws.columns.length } };

  await wb.xlsx.writeFile(targetFile);
  
  console.log('\n========================================');
  console.log('  SUMMARY ADDED AT BOTTOM OF FILE!');
  console.log('========================================');
  console.log(`🟢 HOT CALL TARGETS: ${counts.hotTarget}`);
  console.log(`🔵 HAS REAL WEBSITE: ${counts.hasWebsite}`);
  console.log(`🔴 NO PHONE: ${counts.noPhone}`);
  console.log(`📊 TOTAL LEADS: ${totalLeads}`);
  console.log('========================================\n');
}

categorize().catch(err => console.error('Error categorizing:', err));
