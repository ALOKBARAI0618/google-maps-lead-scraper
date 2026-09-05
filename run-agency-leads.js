/**
 * run-agency-leads.js
 * Digital Marketing Agency Lead Scraper — International Cities
 * 
 * Scrapes "marketing agency" and "digital agency" leads for each city.
 * Each city gets TWO scrape passes (marketing agency + digital agency).
 * After both queries complete, a DEDUP step removes duplicate leads
 * from the second file that already exist in the first (by name, phone, or email).
 * 18-minute IP cooldown between cities.
 *
 * Cities Queue:
 *   1. Dubai          (UAE)
 *   2. Abu Dhabi       (UAE)
 *   3. Sharjah         (UAE)
 *   4. Johannesburg    (South Africa)
 *   5. Cape Town       (South Africa)
 *   6. Durban          (South Africa)
 *   7. Pretoria        (South Africa)
 *   8. Boston          (USA)
 *   9. Washington DC   (USA)
 *  10. Atlanta         (USA)
 *  11. Miami           (USA)
 *  12. Dallas          (USA)
 *  13. Seattle         (USA)
 *
 * Output: playwright/Agency Leads/<CityName> <Type> Leads.xlsx
 */

const { spawn } = require('child_process');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');

// Each city gets two queries: "marketing agency <city>" and "digital agency <city>"
const CITIES_QUEUE = [
  { name: 'Pretoria',       queries: ['marketing agency pretoria'] },
  { name: 'Boston',         queries: ['marketing agency boston'] },
  { name: 'Washington DC',  queries: ['marketing agency washington dc'] },
  { name: 'Atlanta',        queries: ['marketing agency atlanta'] },
  { name: 'Miami',          queries: ['marketing agency miami'] },
  { name: 'Dallas',         queries: ['marketing agency dallas'] },
  { name: 'Seattle',        queries: ['marketing agency seattle'] },
];

const REST_BETWEEN_CITIES_MS = 10 * 60 * 1000; // 10 Minutes IP Cooldown
const REST_BETWEEN_QUERIES_MS = 3 * 60 * 1000; // 3 Minutes between queries within same city
const OUTPUT_DIR = path.join(__dirname, 'Agency Leads');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
  console.log(`[${time}] ${msg}`);
}

// ===== DEDUP LOGIC =====
// Normalize a string for comparison (lowercase, strip extra spaces/special chars)
function normalize(val) {
  if (!val) return '';
  return String(val).toLowerCase().replace(/[^a-z0-9@.]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build a fingerprint set from an Excel worksheet.
 * Collects normalized names, phone numbers, and emails.
 */
function buildFingerprintSet(worksheet) {
  const fingerprints = new Set();
  const headerRow = worksheet.getRow(1);
  
  // Find column indices by header name
  const colMap = {};
  headerRow.eachCell((cell, colNumber) => {
    const header = normalize(cell.value);
    if (header.includes('name') || header.includes('business')) colMap.name = colNumber;
    if (header.includes('phone') || header.includes('mobile') || header.includes('tel')) colMap.phone = colNumber;
    if (header.includes('email') || header.includes('mail')) colMap.email = colNumber;
  });

  // Iterate all data rows (skip header)
  worksheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header

    // Add name fingerprint
    if (colMap.name) {
      const name = normalize(row.getCell(colMap.name).value);
      if (name && name.length > 2) fingerprints.add('n:' + name);
    }

    // Add phone fingerprint (strip all non-digits, take last 10)
    if (colMap.phone) {
      const rawPhone = String(row.getCell(colMap.phone).value || '');
      // Handle comma-separated multiple phones
      rawPhone.split(/[,;]/).forEach(p => {
        const digits = p.replace(/[^0-9]/g, '');
        if (digits.length >= 7) {
          fingerprints.add('p:' + digits.slice(-10));
        }
      });
    }

    // Add email fingerprint
    if (colMap.email) {
      const rawEmail = String(row.getCell(colMap.email).value || '');
      rawEmail.split(/[,;]/).forEach(e => {
        const em = normalize(e);
        if (em && em.includes('@')) fingerprints.add('e:' + em);
      });
    }
  });

  return fingerprints;
}

/**
 * Check if a row is a duplicate based on fingerprints
 */
function isDuplicate(row, colMap, fingerprints) {
  // Check name
  if (colMap.name) {
    const name = normalize(row.getCell(colMap.name).value);
    if (name && name.length > 2 && fingerprints.has('n:' + name)) return true;
  }

  // Check phone
  if (colMap.phone) {
    const rawPhone = String(row.getCell(colMap.phone).value || '');
    const phones = rawPhone.split(/[,;]/);
    for (const p of phones) {
      const digits = p.replace(/[^0-9]/g, '');
      if (digits.length >= 7 && fingerprints.has('p:' + digits.slice(-10))) return true;
    }
  }

  // Check email
  if (colMap.email) {
    const rawEmail = String(row.getCell(colMap.email).value || '');
    const emails = rawEmail.split(/[,;]/);
    for (const e of emails) {
      const em = normalize(e);
      if (em && em.includes('@') && fingerprints.has('e:' + em)) return true;
    }
  }

  return false;
}

/**
 * Dedup: Remove leads from file2 that already exist in file1.
 * Returns count of removed duplicates.
 */
async function deduplicateFiles(file1Path, file2Path) {
  if (!fs.existsSync(file1Path) || !fs.existsSync(file2Path)) {
    log('  ⚠️  One or both files missing, skipping dedup.');
    return 0;
  }

  try {
    // Read file1 and build fingerprints
    const wb1 = new ExcelJS.Workbook();
    await wb1.xlsx.readFile(file1Path);
    const ws1 = wb1.getWorksheet(1);
    if (!ws1 || ws1.rowCount <= 1) {
      log('  ⚠️  File 1 is empty, skipping dedup.');
      return 0;
    }

    const fingerprints = buildFingerprintSet(ws1);
    log(`  🔍 File 1 fingerprints: ${fingerprints.size} unique identifiers`);

    // Read file2
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(file2Path);
    const ws2 = wb2.getWorksheet(1);
    if (!ws2 || ws2.rowCount <= 1) {
      log('  ⚠️  File 2 is empty, skipping dedup.');
      return 0;
    }

    // Find column indices in file2
    const headerRow2 = ws2.getRow(1);
    const colMap2 = {};
    headerRow2.eachCell((cell, colNumber) => {
      const header = normalize(cell.value);
      if (header.includes('name') || header.includes('business')) colMap2.name = colNumber;
      if (header.includes('phone') || header.includes('mobile') || header.includes('tel')) colMap2.phone = colNumber;
      if (header.includes('email') || header.includes('mail')) colMap2.email = colNumber;
    });

    // Find duplicate rows (collect row numbers to delete, in reverse order)
    const duplicateRows = [];
    const originalCount = ws2.rowCount - 1; // exclude header

    ws2.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      if (isDuplicate(row, colMap2, fingerprints)) {
        duplicateRows.push(rowNum);
      }
    });

    if (duplicateRows.length === 0) {
      log(`  ✅ No duplicates found. All ${originalCount} leads in file 2 are unique.`);
      return 0;
    }

    // Remove duplicate rows (delete from bottom to top to preserve indices)
    duplicateRows.sort((a, b) => b - a);
    for (const rowNum of duplicateRows) {
      ws2.spliceRows(rowNum, 1);
    }

    // Save the cleaned file
    await wb2.xlsx.writeFile(file2Path);
    log(`  🗑️  Removed ${duplicateRows.length} duplicates from file 2.`);
    log(`  📊 File 2: ${originalCount} → ${originalCount - duplicateRows.length} unique leads`);

    return duplicateRows.length;
  } catch (err) {
    log(`  ❌ Dedup error: ${err.message}`);
    return 0;
  }
}

/**
 * Global Dedup: Check target file against ALL previous Excel files in output directory.
 * Removes matching Emails, Phones, or Name+Website entries.
 */
async function deduplicateAgainstAllPrevious(targetFilePath) {
  if (!fs.existsSync(targetFilePath)) return 0;

  try {
    const allFiles = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.xlsx') && path.join(OUTPUT_DIR, f) !== targetFilePath);

    if (allFiles.length === 0) return 0;

    const masterFingerprints = new Set();

    for (const f of allFiles) {
      const p = path.join(OUTPUT_DIR, f);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(p);
      const ws = wb.getWorksheet(1);
      if (!ws) continue;

      ws.eachRow((row, rNum) => {
        if (rNum === 1) return;
        const email = normalize(row.getCell(7).value);
        const p1 = row.getCell(12).value;
        const p2 = row.getCell(13).value;
        const p3 = row.getCell(14).value;
        const name = normalize(row.getCell(2).value);
        const website = normalize(row.getCell(15).value);

        if (email && email.includes('@')) masterFingerprints.add('e:' + email);

        [p1, p2, p3].forEach(phoneVal => {
          if (!phoneVal) return;
          String(phoneVal).split(/[,;]/).forEach(pv => {
            const digits = pv.replace(/[^0-9]/g, '');
            if (digits.length >= 7) masterFingerprints.add('p:' + digits.slice(-10));
          });
        });

        if (name && website) masterFingerprints.add('nw:' + name + '||' + website);
      });
    }

    log(`  🔍 Master Fingerprints loaded: ${masterFingerprints.size} unique keys from ${allFiles.length} previous files`);

    const wbT = new ExcelJS.Workbook();
    await wbT.xlsx.readFile(targetFilePath);
    const wsT = wbT.getWorksheet(1);
    if (!wsT || wsT.rowCount <= 1) return 0;

    const rowsToKeep = [];
    let removedCount = 0;
    const originalCount = wsT.rowCount - 1;

    wsT.eachRow((row, rNum) => {
      if (rNum === 1) return;

      const email = normalize(row.getCell(7).value);
      const p1 = row.getCell(12).value;
      const p2 = row.getCell(13).value;
      const p3 = row.getCell(14).value;
      const name = normalize(row.getCell(2).value);
      const website = normalize(row.getCell(15).value);

      let isDup = false;

      if (email && email.includes('@') && masterFingerprints.has('e:' + email)) {
        isDup = true;
      }

      if (!isDup) {
        const phones = [p1, p2, p3];
        for (const phoneVal of phones) {
          if (!phoneVal) continue;
          const pvs = String(phoneVal).split(/[,;]/);
          for (const pv of pvs) {
            const digits = pv.replace(/[^0-9]/g, '');
            if (digits.length >= 7 && masterFingerprints.has('p:' + digits.slice(-10))) {
              isDup = true;
              break;
            }
          }
          if (isDup) break;
        }
      }

      if (!isDup && name && website && masterFingerprints.has('nw:' + name + '||' + website)) {
        isDup = true;
      }

      if (isDup) {
        removedCount++;
      } else {
        if (email && email.includes('@')) masterFingerprints.add('e:' + email);
        [p1, p2, p3].forEach(phoneVal => {
          if (!phoneVal) return;
          String(phoneVal).split(/[,;]/).forEach(pv => {
            const digits = pv.replace(/[^0-9]/g, '');
            if (digits.length >= 7) masterFingerprints.add('p:' + digits.slice(-10));
          });
        });
        if (name && website) masterFingerprints.add('nw:' + name + '||' + website);

        rowsToKeep.push(row.values.slice(1));
      }
    });

    if (removedCount > 0) {
      const newWb = new ExcelJS.Workbook();
      const newWs = newWb.addWorksheet('Agency Leads');
      newWs.addRow(wsT.getRow(1).values.slice(1));
      newWs.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      newWs.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E78' } };
      rowsToKeep.forEach(r => newWs.addRow(r));
      await newWb.xlsx.writeFile(targetFilePath);

      log(`  🗑️ Removed ${removedCount} cross-file duplicate(s) from ${path.basename(targetFilePath)}`);
      log(`  📊 ${path.basename(targetFilePath)}: ${originalCount} → ${rowsToKeep.length} unique leads`);
    } else {
      log(`  ✅ 0 cross-file duplicates found. All ${originalCount} leads are 100% unique!`);
    }

    return removedCount;
  } catch (err) {
    log(`  ❌ Cross-file dedup error: ${err.message}`);
    return 0;
  }
}

// ===== SCRAPER RUNNER =====
function runScraper(query, outputFile) {
  return new Promise((resolve) => {
    log(`  📡 Scraping: "${query}"`);
    log(`  📂 Output:  ${outputFile}`);

    const child = spawn('node', [
      'scraper.js',
      query,
      '--output', outputFile
    ], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: false,
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(`  ✅ Query completed: "${query}"`);
      } else {
        log(`  ⚠️ Query "${query}" exited with code ${code}. Continuing...`);
      }
      resolve(code);
    });

    child.on('error', (err) => {
      log(`  ❌ Error: ${err.message}`);
      resolve(1);
    });
  });
}

// ===== MAIN =====
async function main() {
  const totalCities = CITIES_QUEUE.length;
  const totalQueries = CITIES_QUEUE.reduce((sum, c) => sum + c.queries.length, 0);

  log(`\n==================================================`);
  log(`🏢 AGENCY LEADS SCRAPER — INTERNATIONAL CITIES`);
  log(`==================================================`);
  log(`Total Cities:  ${totalCities}`);
  log(`Total Queries: ${totalQueries}`);
  log(`Queue: ${CITIES_QUEUE.map(c => c.name).join(' → ')}`);
  log(`IP Cooldown:   ${REST_BETWEEN_CITIES_MS / 60000} minutes between cities`);
  log(`Dedup:         ✅ Cross-query deduplication enabled`);
  log(`Output Folder: ${OUTPUT_DIR}`);
  log(`==================================================\n`);

  for (let i = 0; i < CITIES_QUEUE.length; i++) {
    const city = CITIES_QUEUE[i];
    const outputFiles = [];

    log(`\n╔══════════════════════════════════════════════════╗`);
    log(`║  🚀 CITY [${i + 1}/${totalCities}]: ${city.name.toUpperCase().padEnd(30)} ║`);
    log(`╚══════════════════════════════════════════════════╝\n`);

    // Run each query for this city
    for (let q = 0; q < city.queries.length; q++) {
      const query = city.queries[q];
      const queryType = query.includes('digital agency') ? 'Digital Agency' : 'Marketing Agency';
      const outputFile = path.join(OUTPUT_DIR, `${city.name} ${queryType} Leads.xlsx`);
      outputFiles.push(outputFile);

      await runScraper(query, outputFile);

      // Short rest between queries within same city (if more queries remain)
      if (q < city.queries.length - 1) {
        log(`  ⏳ Short rest (5 min) before next query for ${city.name}...`);
        await sleep(REST_BETWEEN_QUERIES_MS);
      }
    }

    // ===== GLOBAL CROSS-FILE DEDUP =====
    log(`\n  🔄 DEDUP: Checking "${city.name}" leads against ALL previous city files...`);
    for (const outputFile of outputFiles) {
      await deduplicateAgainstAllPrevious(outputFile);
    }

    log(`\n✅ CITY DONE: ${city.name} — All queries completed & globally deduped.`);

    // 18-minute IP cooldown between cities (if more cities remain)
    if (i < CITIES_QUEUE.length - 1) {
      log(`\n😴 IP COOLDOWN: 18 minutes before ${CITIES_QUEUE[i + 1].name}...`);

      const totalRestSec = REST_BETWEEN_CITIES_MS / 1000;
      const intervalSec = 180; // Update every 3 minutes

      for (let elapsed = 0; elapsed < totalRestSec; elapsed += intervalSec) {
        const remainingMin = Math.ceil((totalRestSec - elapsed) / 60);
        log(`⏳ ${remainingMin} min remaining → Next: ${CITIES_QUEUE[i + 1].name}`);
        await sleep(Math.min(intervalSec * 1000, (totalRestSec - elapsed) * 1000));
      }

      log(`⏰ Cooldown complete! Starting ${CITIES_QUEUE[i + 1].name}...\n`);
    }
  }

  log(`\n🎉 ALL ${totalCities} CITIES COMPLETED! Agency lead scrape finished.`);
  log(`📁 Output: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('Agency leads runner error:', err);
});
