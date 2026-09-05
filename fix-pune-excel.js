const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'output', 'builder-pune-sample.xlsx');
const csvFile = path.join(__dirname, 'output', 'builder-pune-sample.csv');

async function fixPuneExcel() {
  // 1. Delete Pune CSV file
  if (fs.existsSync(csvFile)) {
    fs.unlinkSync(csvFile);
    console.log(`Deleted CSV file: ${csvFile}`);
  }

  if (!fs.existsSync(targetFile)) {
    console.error(`Target file not found: ${targetFile}`);
    return;
  }

  console.log(`Modifying Pune Excel: ${targetFile}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(targetFile);
  const ws = wb.getWorksheet('Leads');

  // Read all existing rows data
  const rowCount = ws.rowCount;
  const headerRow = ws.getRow(1);
  const colMap = {};
  headerRow.eachCell((cell, colNum) => {
    colMap[String(cell.value || '').trim()] = colNum;
  });

  console.log('Original Header Columns:', Object.keys(colMap));

  // Build new structure
  const newWorkbook = new ExcelJS.Workbook();
  newWorkbook.creator = 'Maps Lead Scraper Agent';
  newWorkbook.created = new Date();

  const newSheet = newWorkbook.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
    properties: { defaultRowHeight: 22 },
  });

  // Target columns order — Phone 2 & Phone 3 removed, Website right next to Phone
  const newColumns = [
    { header: 'S.No',               key: 'sno',      width: 7  },
    { header: 'Name',               key: 'name',     width: 32 },
    { header: 'Category',           key: 'category', width: 26 },
    { header: 'Address',            key: 'address',  width: 36 },
    { header: 'Rating',             key: 'rating',   width: 9  },
    { header: 'Reviews',            key: 'reviews',  width: 10 },
    { header: 'Email',              key: 'email',    width: 30 },
    { header: 'Google Maps URL',    key: 'mapsUrl',  width: 18 },
    { header: 'Area',               key: 'area',     width: 16 },
    { header: 'Status',             key: 'status',   width: 14 },
    { header: 'Lead Type',          key: 'leadType', width: 22 },
    { header: 'Phone',              key: 'phone',    width: 18 },
    { header: 'Website',            key: 'website',  width: 28 },
    { header: 'Call',               key: 'call',     width: 14, options: ['Yes', 'No', 'Pending', 'Yes (After This Week)'] },
    { header: 'Not Call',           key: 'notCall',  width: 14, options: ['Yes', 'No', 'Pending'] },
    { header: 'Asking for Detailed', key: 'detailed', width: 20, options: ['Yes', 'No', 'Pending', 'Sent'] },
    { header: 'Directly Rejected',  key: 'rejected', width: 20, options: ['Yes', 'No'] },
    { header: 'Asking for Demo',    key: 'demo',     width: 20, options: ['Yes', 'No', 'Pending', 'Scheduled'] },
    { header: 'Follow Up Date',     key: 'followUp', width: 16 },
    { header: 'Notes',              key: 'notes',    width: 30 },
  ];

  newSheet.columns = newColumns.map(c => ({ header: c.header, key: c.key, width: c.width }));

  // Header styling
  const newHeaderRow = newSheet.getRow(1);
  newHeaderRow.height = 30;
  const crmStartCol = 14; // Call is col 14
  newHeaderRow.eachCell((cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colNum >= crmStartCol ? 'FF0E4D45' : 'FF1F4E79' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0D3B66' } }, bottom: { style: 'medium', color: { argb: 'FF0D3B66' } },
      left: { style: 'thin', color: { argb: 'FF0D3B66' } }, right: { style: 'thin', color: { argb: 'FF0D3B66' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  const cellFont = { size: 10, name: 'Calibri' };
  const cellBorder = { bottom: { style: 'thin', color: { argb: 'FFBFCFE0' } }, right: { style: 'thin', color: { argb: 'FFBFCFE0' } }, left: { style: 'thin', color: { argb: 'FFBFCFE0' } } };
  const evenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
  const oddFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  const trackFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };

  // Copy rows
  let dataRowCount = 0;
  for (let r = 2; r <= rowCount; r++) {
    const origRow = ws.getRow(r);
    const snoVal = origRow.getCell(colMap['S.No'] || 1).value;

    // Check if summary row
    if (typeof snoVal !== 'number' && (!snoVal || isNaN(Number(snoVal)))) {
      // End of main data
      break;
    }

    dataRowCount++;

    // Extract values
    const getValue = (headerName) => {
      const idx = colMap[headerName];
      if (!idx) return '';
      const cell = origRow.getCell(idx);
      if (cell.value && typeof cell.value === 'object') {
        if (cell.value.hyperlink) return cell.value.hyperlink;
        if (cell.value.text) return cell.value.text;
      }
      return cell.value || '';
    };

    const phone1 = getValue('Phone 1') || getValue('Phone');
    const phone2 = getValue('Phone 2');
    const phone3 = getValue('Phone 3');
    const phoneVal = [phone1, phone2, phone3].filter(Boolean).join(' / ');

    const webVal = getValue('Website');
    const mapsVal = getValue('Google Maps URL');
    const leadTypeVal = getValue('Lead Type');
    const statusVal = getValue('Status');

    const rowData = {
      sno:      dataRowCount,
      name:     getValue('Name'),
      category: getValue('Category'),
      address:  getValue('Address'),
      rating:   getValue('Rating'),
      reviews:  getValue('Reviews'),
      email:    getValue('Email'),
      mapsUrl:  mapsVal,
      area:     getValue('Area'),
      status:   statusVal,
      leadType: leadTypeVal,
      phone:    phoneVal,
      website:  webVal,
      call:     '',
      notCall:  '',
      detailed: '',
      rejected: '',
      demo:     '',
      followUp: '',
      notes:    ''
    };

    const newRow = newSheet.addRow(rowData);
    const fill = (dataRowCount - 1) % 2 === 0 ? evenFill : oddFill;

    newRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = colNum >= crmStartCol ? trackFill : fill;
      cell.border = cellBorder;
      cell.font = { ...cellFont };
      cell.alignment = { vertical: 'middle', wrapText: false };
    });
    newRow.height = 22;

    // Lead Type formatting
    const ltCell = newRow.getCell('leadType');
    if (String(leadTypeVal).includes('HOT')) {
      ltCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
      ltCell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: 'FF006100' } };
    } else if (String(leadTypeVal).includes('REAL')) {
      ltCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      ltCell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: 'FF002060' } };
    } else {
      ltCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
      ltCell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: 'FF888888' } };
    }
    ltCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Hyperlinks
    const urlCell = newRow.getCell('mapsUrl');
    if (mapsVal && String(mapsVal).startsWith('http')) {
      urlCell.value = { text: 'Open Map 📍', hyperlink: mapsVal };
      urlCell.font = { ...cellFont, color: { argb: 'FF0563C1' }, underline: true };
    }
    const webCell = newRow.getCell('website');
    if (webVal && String(webVal).startsWith('http')) {
      webCell.value = { text: String(webVal).replace(/^https?:\/\/(www\.)?/i, '').split('/')[0], hyperlink: webVal };
      webCell.font = { ...cellFont, color: { argb: 'FF0563C1' }, underline: true };
    }

    // Status color
    const sc = newRow.getCell('status');
    if (statusVal === 'Email Found') sc.font = { ...cellFont, bold: true, color: { argb: 'FF217346' } };
    else if (statusVal === 'No Email') sc.font = { ...cellFont, color: { argb: 'FFBF8F00' } };
    else sc.font = { ...cellFont, color: { argb: 'FFCC3300' } };

    // Alignments
    newRow.getCell('sno').alignment = { vertical: 'middle', horizontal: 'center' };
    newRow.getCell('sno').font = { ...cellFont, bold: true, color: { argb: 'FF555555' } };
    newRow.getCell('rating').alignment = { vertical: 'middle', horizontal: 'center' };
    newRow.getCell('rating').font = { ...cellFont, bold: true };
    newRow.getCell('reviews').alignment = { vertical: 'middle', horizontal: 'center' };
  }

  // Calculate counts for summary table
  let hotCount = 0, realCount = 0, noPhoneCount = 0;
  for (let r = 2; r <= dataRowCount + 1; r++) {
    const val = String(newSheet.getCell(r, newSheet.getColumn('leadType').number).value || '');
    if (val.includes('HOT')) hotCount++;
    else if (val.includes('REAL')) realCount++;
    else if (val.includes('NO PHONE')) noPhoneCount++;
  }

  // Summary Rows at bottom
  newSheet.addRow([]); // spacer
  const leadTypeColIdx = newSheet.getColumn('leadType').number;

  function addSummaryRow(label, count, fontColor, bgColor) {
    const row = newSheet.addRow({});
    row.height = 22;
    const labelCell = row.getCell(leadTypeColIdx - 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 11, name: 'Calibri', color: { argb: fontColor } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'right' };
    labelCell.border = { bottom: { style: 'thin', color: { argb: 'FFBFCFE0' } }, top: { style: 'thin', color: { argb: 'FFBFCFE0' } } };

    const countCell = row.getCell(leadTypeColIdx);
    countCell.value = count;
    countCell.font = { bold: true, size: 12, name: 'Calibri', color: { argb: fontColor } };
    countCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    countCell.alignment = { vertical: 'middle', horizontal: 'center' };
    countCell.border = { bottom: { style: 'thin', color: { argb: 'FFBFCFE0' } }, top: { style: 'thin', color: { argb: 'FFBFCFE0' } } };
  }

  addSummaryRow('🟢 Total Hot Call Targets (Phone ✅, Site ❌)', hotCount, 'FF006100', 'FFC6EFCE');
  addSummaryRow('🔵 Total Has Real Website (Phone ✅, Site ✅)', realCount, 'FF002060', 'FFDDEBF7');
  addSummaryRow('🔴 Total No Phone (Cannot Call)', noPhoneCount, 'FF888888', 'FFEEEEEE');
  addSummaryRow('📊 GRAND TOTAL LEADS', dataRowCount, 'FF1F4E79', 'FFE6EEF8');

  // Dropdown validations
  const lastDataRow = dataRowCount + 1;
  for (const crm of newColumns) {
    if (!crm.options) continue;
    const colNum = newSheet.getColumn(crm.key).number;
    for (let r = 2; r <= lastDataRow; r++) {
      newSheet.getCell(r, colNum).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${crm.options.join(',')}"`], showDropDown: true };
    }
  }

  newSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastDataRow, column: newSheet.columns.length } };

  await newWorkbook.xlsx.writeFile(targetFile);
  console.log(`\n✅ Pune Excel updated successfully!`);
  console.log(`   Columns layout: S.No ... Lead Type | Phone | Website | Call ...`);
  console.log(`   Data Rows: ${dataRowCount}`);
}

fixPuneExcel().catch(err => console.error('Error fixing Pune Excel:', err));
