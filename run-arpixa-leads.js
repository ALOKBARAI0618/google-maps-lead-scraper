/**
 * run-arpixa-leads.js
 * Arpixa Digital Marketing Leads — Jewellery & Real Estate across 19 Canadian Cities
 *
 * Schedule:
 *   For each city:
 *     1. Scrape "jewellery <city>" → saves to jewellery folder
 *     2. 10-minute gap
 *     3. Scrape "real estate <city>" → saves to real estate folder
 *     4. 15-minute break before next city
 *
 * All 19 cities have sub-areas defined in areas.js, so each query
 * auto-expands across ~15 surrounding areas per city.
 *
 * Output Structure:
 *   playwright/Arpixa digital marketing leads/
 *     jewellery/   → Toronto Jewellery Leads.xlsx, Vancouver Jewellery Leads.xlsx, ...
 *     real estate/ → Toronto Real Estate Leads.xlsx, Vancouver Real Estate Leads.xlsx, ...
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ===== CONFIGURATION =====

const CITIES = [
  'Toronto', 'Vancouver', 'Montreal', 'Ottawa', 'Calgary',
  'Edmonton', 'Winnipeg', 'Quebec City', 'Halifax', 'Hamilton',
  'Kitchener', 'Victoria', 'Saskatoon', 'Regina', 'Windsor',
  'Kelowna', "St Johns", 'Barrie', 'Guelph'
];

// Two categories — each city gets both queries
const CATEGORIES = [
  { name: 'jewellery',    queryPrefix: 'jewellery',    folder: 'jewellery' },
  { name: 'real estate',  queryPrefix: 'real estate',  folder: 'real estate' },
];

const GAP_BETWEEN_CATEGORIES_MS = 10 * 60 * 1000;  // 10 min gap between jewellery & real estate for same city
const BREAK_BETWEEN_CITIES_MS   = 15 * 60 * 1000;  // 15 min break after a city completes

const BASE_OUTPUT_DIR = path.join(__dirname, 'Arpixa digital marketing leads');

// ===== HELPERS =====

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
  console.log(`[${time}] ${msg}`);
}

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
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

// ===== COUNTDOWN TIMER =====

async function countdown(totalMs, label) {
  const totalSec = totalMs / 1000;
  const intervalSec = 180; // Log every 3 minutes

  for (let elapsed = 0; elapsed < totalSec; elapsed += intervalSec) {
    const remainingMin = Math.ceil((totalSec - elapsed) / 60);
    log(`  ⏳ ${label}: ${remainingMin} min remaining...`);
    await sleep(Math.min(intervalSec * 1000, (totalSec - elapsed) * 1000));
  }
}

// ===== MAIN =====

async function main() {
  const totalCities = CITIES.length;
  const totalQueries = totalCities * CATEGORIES.length;
  const startTime = Date.now();

  // Ensure output directories exist
  for (const cat of CATEGORIES) {
    const dir = path.join(BASE_OUTPUT_DIR, cat.folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  log(`\n╔══════════════════════════════════════════════════════════╗`);
  log(`║   🏢 ARPIXA DIGITAL MARKETING LEADS SCRAPER            ║`);
  log(`║   Jewellery & Real Estate — 19 Canadian Cities          ║`);
  log(`╚══════════════════════════════════════════════════════════╝`);
  log(``);
  log(`  Total Cities:     ${totalCities}`);
  log(`  Total Queries:    ${totalQueries} (${CATEGORIES.length} per city)`);
  log(`  Categories:       ${CATEGORIES.map(c => c.name).join(', ')}`);
  log(`  Gap between cats: ${GAP_BETWEEN_CATEGORIES_MS / 60000} minutes`);
  log(`  Break after city: ${BREAK_BETWEEN_CITIES_MS / 60000} minutes`);
  log(`  Output:           ${BASE_OUTPUT_DIR}`);
  log(`  Queue: ${CITIES.join(' → ')}`);
  log(``);

  let queryCount = 0;

  for (let i = 0; i < CITIES.length; i++) {
    const city = CITIES[i];

    log(`\n╔══════════════════════════════════════════════════════════╗`);
    log(`║  🚀 CITY [${(i + 1).toString().padStart(2)}/${totalCities}]: ${city.toUpperCase().padEnd(40)} ║`);
    log(`╚══════════════════════════════════════════════════════════╝\n`);

    let cityScrapedAny = false;

    // Run each category for this city
    for (let c = 0; c < CATEGORIES.length; c++) {
      const cat = CATEGORIES[c];
      const query = `${cat.queryPrefix} ${city}`;
      const outputFile = path.join(BASE_OUTPUT_DIR, cat.folder, `${city} ${cat.name.charAt(0).toUpperCase() + cat.name.slice(1)} Leads.xlsx`);

      queryCount++;
      log(`  ── Query [${queryCount}/${totalQueries}] ── ${cat.name.toUpperCase()} ──`);

      if (fs.existsSync(outputFile)) {
        const stats = fs.statSync(outputFile);
        log(`  ⏩ Already exists (${(stats.size / 1024).toFixed(1)} KB), skipping: ${path.basename(outputFile)}`);
        continue;
      }

      cityScrapedAny = true;
      await runScraper(query, outputFile);

      // 10-minute gap between categories (jewellery → real estate) for same city if next category needs scraping
      if (c < CATEGORIES.length - 1) {
        const nextCat = CATEGORIES[c + 1];
        const nextOutputFile = path.join(BASE_OUTPUT_DIR, nextCat.folder, `${city} ${nextCat.name.charAt(0).toUpperCase() + nextCat.name.slice(1)} Leads.xlsx`);
        if (!fs.existsSync(nextOutputFile)) {
          log(`\n  ⏸️  10-MINUTE GAP before Real Estate for ${city}...`);
          await countdown(GAP_BETWEEN_CATEGORIES_MS, `Gap (${city})`);
          log(`  ⏰ Gap complete! Starting Real Estate for ${city}...\n`);
        }
      }
    }

    log(`\n  ✅ CITY DONE: ${city}`);

    // 15-minute break between cities (only if we actually scraped something and more cities remain)
    if (cityScrapedAny && i < CITIES.length - 1) {
      log(`\n  😴 15-MINUTE BREAK before next city: ${CITIES[i + 1]}...`);
      await countdown(BREAK_BETWEEN_CITIES_MS, `Break → ${CITIES[i + 1]}`);
      log(`  ⏰ Break complete! Starting ${CITIES[i + 1]}...\n`);
    }
  }

  const elapsed = Date.now() - startTime;
  log(`\n╔══════════════════════════════════════════════════════════╗`);
  log(`║  🎉 ALL ${totalCities} CITIES COMPLETED!                          ║`);
  log(`╚══════════════════════════════════════════════════════════╝`);
  log(`  Total Queries: ${totalQueries}`);
  log(`  Total Time:    ${formatDuration(elapsed)}`);
  log(`  Output:        ${BASE_OUTPUT_DIR}`);
  log(`    ├── jewellery/   (${CITIES.length} files)`);
  log(`    └── real estate/ (${CITIES.length} files)`);
}

main().catch((err) => {
  console.error('Arpixa leads runner error:', err);
});
