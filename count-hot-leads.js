const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const outputDir = path.join(__dirname, 'output');

async function analyzeExcelFiles() {
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.xlsx'));
  
  let grandTotalLeads = 0;
  let grandTotalHotLeads = 0;
  let grandTotalEmails = 0;

  console.log(`\n=============================================================`);
  console.log(`📊 EXACT GROUND-TRUTH HOT TARGET ANALYSIS (EXCEL .xlsx ONLY)`);
  console.log(`=============================================================\n`);

  for (const file of files) {
    const filePath = path.join(outputDir, file);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) continue;

    let cityTotal = 0;
    let cityHot = 0;
    let cityEmails = 0;

    // Detect header row
    const headerRow = worksheet.getRow(1);
    let websiteColIndex = -1;
    let emailColIndex = -1;

    headerRow.eachCell((cell, colNumber) => {
      const val = (cell.value || '').toString().toLowerCase();
      if (val.includes('website') || val.includes('target') || val.includes('status')) {
        websiteColIndex = colNumber;
      }
      if (val.includes('email')) {
        emailColIndex = colNumber;
      }
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      cityTotal++;

      // Check if HOT target
      let isHot = false;
      let hasEmail = false;

      row.eachCell((cell, colNumber) => {
        const text = (cell.value || '').toString();
        
        // If cell contains green dot or HOT TARGET or 'No' in website column
        if (text.includes('🟢') || text.includes('HOT') || text.includes('NO WEBSITE')) {
          isHot = true;
        }
        if (emailColIndex !== -1 && colNumber === emailColIndex && text.trim() && text.includes('@')) {
          hasEmail = true;
        }
      });

      // Fallback website check if header index found
      if (!isHot && websiteColIndex !== -1) {
        const webVal = (row.getCell(websiteColIndex).value || '').toString();
        if (!webVal || webVal === 'No' || webVal.includes('🟢') || webVal.toLowerCase().includes('no')) {
          isHot = true;
        }
      }

      if (isHot) cityHot++;
      if (hasEmail) cityEmails++;
    });

    grandTotalLeads += cityTotal;
    grandTotalHotLeads += cityHot;
    grandTotalEmails += cityEmails;

    console.log(`📁 ${file.padEnd(32)} | Total: ${cityTotal.toString().padStart(5)} | 🟢 HOT TARGETS: ${cityHot.toString().padStart(5)} | 📧 Emails: ${cityEmails.toString().padStart(5)}`);
  }

  console.log(`\n=============================================================`);
  console.log(`🔥 GRAND TOTAL ACROSS ALL CITIES:`);
  console.log(`   👉 Total Unique Builder Leads:  ${grandTotalLeads}`);
  console.log(`   👉 🟢 TOTAL HOT CALL TARGETS:   ${grandTotalHotLeads}`);
  console.log(`   👉 📧 Total Emails Found:        ${grandTotalEmails}`);
  console.log(`=============================================================\n`);
}

analyzeExcelFiles().catch(err => console.error(err));
