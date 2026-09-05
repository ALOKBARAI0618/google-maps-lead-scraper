/**
 * run-remaining-cities.js
 * Runs the remaining 3 growth cities (Kolkata, Lucknow, Chennai) sequentially
 * with a 25-minute IP rest break between cities.
 */

const { spawn } = require('child_process');
const path = require('path');

const CITIES_QUEUE = [
  { name: 'Kolkata',   query: 'builder kolkata' },
  { name: 'Lucknow',   query: 'builder lucknow' },
  { name: 'Chennai',   query: 'builder chennai' },
];

const REST_BETWEEN_CITIES_MS = 25 * 60 * 1000; // 25 Minutes IP Cooldown

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
  console.log(`[${time}] ${msg}`);
}

async function runCityScraper(cityObj, index, total) {
  log(`\n==================================================`);
  log(`🚀 STARTING CITY [${index + 1}/${total}]: ${cityObj.name.toUpperCase()}`);
  log(`Query: "${cityObj.query}"`);
  log(`==================================================\n`);

  return new Promise((resolve) => {
    const child = spawn('node', ['scraper.js', `"${cityObj.query}"`], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ CITY COMPLETED: ${cityObj.name}`);
      } else {
        log(`⚠️ CITY ${cityObj.name} exited with code ${code}. Moving forward...`);
      }
      resolve();
    });

    child.on('error', (err) => {
      log(`❌ Error running city ${cityObj.name}: ${err.message}`);
      resolve();
    });
  });
}

async function main() {
  log(`==================================================`);
  log(`🔥 REMAINING CITIES SCRAPER RUNNER STARTED`);
  log(`Total Cities Queued: ${CITIES_QUEUE.length}`);
  log(`Queue: ${CITIES_QUEUE.map(c => c.name).join(' -> ')}`);
  log(`IP Cooldown between cities: 25 minutes`);
  log(`==================================================\n`);

  for (let i = 0; i < CITIES_QUEUE.length; i++) {
    const city = CITIES_QUEUE[i];

    // Run scraper for this city
    await runCityScraper(city, i, CITIES_QUEUE.length);

    // 25-minute IP rest timer if more cities remain
    if (i < CITIES_QUEUE.length - 1) {
      log(`\n😴 PAUSING FOR 25 MINUTES IP REST...`);
      log(`Next city in queue: ${CITIES_QUEUE[i + 1].name}`);

      const totalRestSec = REST_BETWEEN_CITIES_MS / 1000;
      const intervalSec = 300; // Update log every 5 minutes

      for (let elapsed = 0; elapsed < totalRestSec; elapsed += intervalSec) {
        const remainingMin = Math.ceil((totalRestSec - elapsed) / 60);
        log(`⏳ IP Cooldown: ${remainingMin} minutes remaining before starting ${CITIES_QUEUE[i + 1].name}...`);
        await sleep(Math.min(intervalSec * 1000, (totalRestSec - elapsed) * 1000));
      }

      log(`⏰ IP Rest Complete! Starting ${CITIES_QUEUE[i + 1].name} now...\n`);
    }
  }

  log(`\n🎉 ALL ${CITIES_QUEUE.length} REMAINING CITIES COMPLETED SUCCESSFULLY!`);
}

main().catch((err) => {
  console.error('Remaining cities runner error:', err);
});
