const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const Datastore = require('nedb-promises');
const { appendLeadsToSheet } = require('./gsheet-uploader');
const COUNTRY_STATE_CITIES = require('./public/cities-data');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

// Commercial DB: NeDB for fast, indexed storage
const db = new Datastore({ filename: path.join(__dirname, 'leads.db'), autoload: true });

app.use(express.json());
app.use(express.static('public'));

let scraperProcess = null;
let queryQueue = [];
let isProcessingQueue = false;
let isPaused = false;
let sessionOutputFile = null; // Track output file for multi-query sessions
let sessionStartLeadCount = 0; // Track count to only sync new leads
let globalCampaignDelay = 5000; // Default delay between queue items
let globalStateTracker = null; // Tracks per category|state completion for progress file
let globalSessionLimit = 0; // Max leads per query for the current campaign queue
let globalSessionProxy = ''; // Comma-separated proxy list for the current campaign queue
// Per-campaign tallies so the end-of-campaign summary reflects what actually
// happened instead of always claiming success. Reset when a queue starts.
let campaignStats = { total: 0, succeeded: 0, failed: 0, failedNames: [] };

// In-memory description of a chained campaign, so one category finishing can
// start the next without a button click.
let campaignChain = null; // { categories: [...], currentIndex: 0 }
let campaignCountry = 'USA';

const PROGRESS_FILE = path.join(__dirname, 'campaign-progress.json');
// Holds the live queue + chain position so a crash or PC reboot resumes where
// it stopped. Cleared on a deliberate /stop and on natural completion.
const CAMPAIGN_STATE_FILE = path.join(__dirname, 'campaign-state.json');

// Load persisted progress.
// Current shape: { "Category": { "State": ["city1", "city2", ...] } }
// Legacy shape:  { "Category": ["State1", "State2"] }  (whole state, pre per-city)
// Both are accepted; legacy entries are upgraded on read so nothing breaks.
function loadProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const raw = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
            const upgraded = {};
            for (const [cat, val] of Object.entries(raw)) {
                if (Array.isArray(val)) {
                    // Legacy: the state was fully done, so record it as such by
                    // trusting every city of it is complete.
                    upgraded[cat] = {};
                    for (const state of val) {
                        const cities = (COUNTRY_STATE_CITIES['USA'] || {})[state] || [];
                        if (cities.length) upgraded[cat][state] = [...cities];
                    }
                } else if (val && typeof val === 'object') {
                    upgraded[cat] = val;
                }
            }
            return upgraded;
        }
    } catch (e) {
        console.error('Error loading progress file:', e);
    }
    return {};
}

function saveProgress(data) {
    try {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving progress file:', e);
    }
}

// Record one finished city. Partial state progress now survives stops/restarts.
function recordCityDone(category, state, city) {
    if (!category || !state || !city) return;
    const progress = loadProgress();
    if (!progress[category]) progress[category] = {};
    if (!progress[category][state]) progress[category][state] = [];
    const set = new Set(progress[category][state]);
    if (set.has(city)) return;
    set.add(city);
    progress[category][state] = [...set];
    saveProgress(progress);

    // Tell the UI a city landed so badges refresh live instead of on reload.
    const total = (COUNTRY_STATE_CITIES[campaignCountry] || {})[state] || [];
    io.emit('progress', { category, state, city, done: progress[category][state].length, total: total.length });
    if (total.length && progress[category][state].length >= total.length) {
        io.emit('log', `✅ Progress saved: ${category} - ${state} complete.`);
    }
}

// True when every city of this state is recorded for the category.
function isStateComplete(category, state, country) {
    const cities = (COUNTRY_STATE_CITIES[country || 'USA'] || {})[state] || [];
    if (cities.length === 0) return false;
    const done = (loadProgress()[category] || {})[state] || [];
    const doneSet = new Set(done);
    return cities.every((c) => doneSet.has(c));
}

// --- Crash-resumable campaign state -------------------------------------
// The whole point: if the server dies or the PC reboots mid-campaign, the
// queue is rebuilt from this file on the next boot and carries on. A
// deliberate /stop writes nothing here, so it stays stopped.

function saveCampaignState(state) {
    try {
        if (!state) {
            if (fs.existsSync(CAMPAIGN_STATE_FILE)) fs.unlinkSync(CAMPAIGN_STATE_FILE);
            return;
        }
        fs.writeFileSync(CAMPAIGN_STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('Error saving campaign state:', e);
    }
}

function loadCampaignState() {
    try {
        if (fs.existsSync(CAMPAIGN_STATE_FILE)) {
            return JSON.parse(fs.readFileSync(CAMPAIGN_STATE_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Error loading campaign state:', e);
    }
    return null;
}

// The job currently being scraped. A crash mid-scrape leaves it neither in the
// queue nor recorded as done, so without it the city would be silently dropped
// and its state could never reach a full DONE badge.
let currentJob = null;

// Persist whatever is still pending, so a crash before the next write still
// leaves a resumable queue. Called after a job is popped and after it settles.
function persistPendingQueue() {
    if (!isProcessingQueue && !isPaused) return;
    if (!campaignChain) return;
    saveCampaignState({
        queue: queryQueue.map((j) => ({
            query: j.query, category: j.category, state: j.state,
            city: j.city, trackerKey: j.trackerKey,
        })),
        inFlight: currentJob ? {
            query: currentJob.query, category: currentJob.category,
            state: currentJob.state, city: currentJob.city,
            trackerKey: currentJob.trackerKey,
        } : null,
        chain: campaignChain,
        country: campaignCountry,
        outputFile: sessionOutputFile,
        delay: globalCampaignDelay,
        limit: globalSessionLimit,
        proxy: globalSessionProxy,
        // The set of already-synced emails is rebuilt from the sheet on demand,
        // so nothing needs to be persisted here. Persisting a row-number cursor
        // was actively harmful: it survived a workbook rewrite that reorded the
        // rows it pointed at.
        syncedEmails: sessionOutputFile ? [...(gsyncedEmails[sessionOutputFile] || [])] : [],
        stats: campaignStats,
        paused: isPaused,
        savedAt: new Date().toISOString(),
    });
}

// Helper to strip ANSI escape codes from strings
function stripAnsi(str) {
    const ansiRegex = /[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqrtu]/g;
    return str.replace(ansiRegex, '');
}

// Helper for CRM column synchronization
async function ensureCrmColumns(worksheet) {
    const requiredCrm = [
        'Call', 'Not Call', 'Asking for Detailed', 'Directly Rejected',
        'Follow Up Date', 'What was discussed on call?', 'Notes'
    ];
    const headerRow = worksheet.getRow(1).values;
    const colMap = {};
    headerRow.forEach((val, idx) => {
        if (val) colMap[val] = idx;
    });

    let nextCol = worksheet.columnCount + 1;
    let changed = false;
    for (const colName of requiredCrm) {
        if (!colMap[colName]) {
            const cell = worksheet.getRow(1).getCell(nextCol);
            cell.value = colName;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E4D45' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            nextCol++;
            changed = true;
        }
    }
    return changed;
}

// Commercial Sync: Import leads from Excel to DB
async function syncExcelToDb() {
    const filePath = await getLatestLeadFile();
    if (!filePath) return;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet('Leads') || workbook.worksheets[0];
    const headerRow = worksheet.getRow(1).values;

    const leadsToImport = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const lead = {};
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
            const header = headerRow[colNum];
            if (header) {
                let val = cell.value;
                if (val && typeof val === 'object') val = val.text || val.result || '';
                lead[header] = val;
            }
        });
        leadsToImport.push(lead);
    });

    for (const lead of leadsToImport) {
        // Use S.No as a unique identifier for sync
        await db.update({ 'S.No': lead['S.No'] }, lead, { upsert: true });
    }
    console.log(`Synced ${leadsToImport.length} leads from ${path.basename(filePath)} to DB.`);
}

async function getLatestLeadFile() {
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) return null;
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.xlsx'));
    if (files.length === 0) return null;
    const latestFile = files.sort((a, b) => fs.statSync(path.join(outputDir, b)).mtime - fs.statSync(path.join(outputDir, a)).mtime)[0];
    return path.join(outputDir, latestFile);
}

async function getCurrentLeadCount(filePath) {
    try {
        const target = filePath || await getLatestLeadFile();
        if (!target || !fs.existsSync(target)) return 0;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(target);
        const worksheet = workbook.getWorksheet('Leads') || workbook.worksheets[0];
        return Math.max(0, worksheet.rowCount - 1); // Subtract header
    } catch (err) {
        return 0;
    }
}

// Per-file record of which leads have already been pushed to GSheets, keyed by
// the lead's own email rather than its row number.
// A row-number cursor is unsafe here: the scraper rewrites the whole workbook
// when it resumes ("Resumed from Excel"), which reorders rows. A cursor saved
// before the rewrite then points past leads that moved to lower row numbers,
// and the sync silently skips them as "already synced" - that dropped ~660
// emailed leads across most cities of the 22-state run before it was caught.
// An email key is stable no matter how the file is rewritten.
const gsyncedEmails = {};

// Mark the starting point for a file so pre-existing leads are not re-synced.
// The sheet's own per-tab dedupe is the final authority, so this is only an
// optimisation to avoid re-reading leads we already pushed.
async function markSyncStart(filePath) {
    if (!filePath) return;
    gsyncedEmails[filePath] = new Set();
}

// campaignCategory is the category the user picked for this campaign (e.g.
// "Restaurants"). Leads whose scraped subtype doesn't map to a known group
// ("Warehouse store", "Grocery store") fall back to this tab instead of
// spawning a new sheet for every subtype.
async function syncNewLeadsToSheets(campaignCategory) {
    try {
        // Prefer the active session file; otherwise fall back to the most recent file.
        const filePath = (sessionOutputFile && fs.existsSync(sessionOutputFile))
            ? sessionOutputFile
            : await getLatestLeadFile();
        if (!filePath) return { count: 0 };

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Leads') || workbook.worksheets[0];
        const headerRow = worksheet.getRow(1).values;

        const alreadySynced = gsyncedEmails[filePath] || new Set();

        const newLeads = [];
        // seen dedupes the file itself; alreadySynced is the record of what
        // actually reached the sheet. Emails are only added to alreadySynced
        // after the append below succeeds, so a mid-append crash can't leave
        // us believing a lead was synced when it never landed.
        const seen = new Set();
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header
            const lead = {};
            row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                const header = headerRow[colNum];
                if (header) {
                    let val = cell.value;
                    if (val && typeof val === 'object') val = val.text || val.result || '';
                    lead[header] = val;
                }
            });
            // Identify a lead by its own email, not its row number - the
            // workbook is rewritten on resume, so row numbers move.
            const key = String(lead.Email || lead.email || '').trim().toLowerCase();
            if (!key || seen.has(key)) return; // Only emailed leads are synced
            seen.add(key);
            if (!alreadySynced.has(key)) newLeads.push(lead);
        });

        if (newLeads.length > 0) {
            const result = await appendLeadsToSheet(newLeads, { defaultTab: campaignCategory || '' });
            // Only now do we know these leads actually landed on the sheet, so
            // only now do we record them as synced. A crash before this point
            // leaves the set untouched and the leads get re-picked-up next run -
            // the sheet's own dedupe absorbs the harmless retry.
            for (const l of newLeads) {
                alreadySynced.add(String(l.Email || l.email || '').trim().toLowerCase());
            }
            gsyncedEmails[filePath] = alreadySynced;
            return { count: result.count, raw: newLeads.length, file: path.basename(filePath) };
        }
        // Nothing new, but keep the cache for this file so the next sync can
        // skip the whole sheet read.
        gsyncedEmails[filePath] = alreadySynced;
        return { count: 0, file: path.basename(filePath) };
    } catch (err) {
        console.error('Auto-sync error:', err);
        // Surface the failure instead of reporting a silent "0 new leads".
        return { count: 0, error: err.message, file: 'sync-failed' };
    }
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

app.post('/start', async (req, res) => {
    if (scraperProcess) {
        return res.status(400).send('A scraping process is already running.');
    }

    const { query, multiQuery, city, areas, limit, quick, headed, proxy } = req.body;

    // Capture current lead count before starting new scrape to avoid duplicating data in GSheets
    sessionStartLeadCount = await getCurrentLeadCount();
    console.log(`Session started. Base lead count: ${sessionStartLeadCount}`);
    // Single-query writes to the latest file, so the cursor must start from its current count
    await markSyncStart(await getLatestLeadFile());

    if (multiQuery) {
        const queries = multiQuery.split('\n').map(q => q.trim()).filter(Boolean);
        if (queries.length === 0) return res.status(400).send('No valid queries provided.');

        queryQueue = queries;
        isProcessingQueue = true;
        campaignStats = { total: queries.length, succeeded: 0, failed: 0, failedNames: [] };

        // Generate a single session file for all multi-query results
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        sessionOutputFile = path.join(__dirname, 'output', `MultiQuery_Session_${timestamp}.xlsx`);

        // New session file starts empty, so the sync cursor begins at 0
        await markSyncStart(sessionOutputFile);

        // Start the first one
        processNextInQueue();
        return res.send({ status: 'queued', count: queries.length });
    }

    if (!query) {
        return res.status(400).send('Query is required.');
    }

    const args = [query];
    if (city) args.push('--city', city);
    if (areas) args.push('--areas', areas);
    if (headed) args.push('--headed');
    if (quick) args.push('--quick');
    if (limit > 0) args.push('--limit', limit.toString());
    if (proxy) args.push('--proxy', proxy);

    console.log(`Starting scraper with args: ${args.join(' ')}`);

    scraperProcess = spawn('node', ['scraper.js', ...args]);

    scraperProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(output);
        io.emit('log', stripAnsi(output));
    });

    scraperProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(output);
        io.emit('log', '❌ Error: ' + stripAnsi(output));
    });

    scraperProcess.on('close', async (code) => {
        console.log(`Scraper process exited with code ${code}`);
        io.emit('log', `\nProcess finished with exit code ${code}.`);

        // Automatically sync new data to Google Sheets
        console.log('Triggering automatic GSheet sync for new leads...');
        const syncResult = await syncNewLeadsToSheets();
        console.log(`Auto-sync complete: ${syncResult.count || 0} new leads synced.`);
        io.emit('log', `\n✅ Auto-synced ${syncResult.count || 0} new leads to Google Sheets.`);

        scraperProcess = null;
        // This endpoint runs a single scrape, so the run is over now. The UI
        // resets its buttons on this event rather than by matching "DONE!" in
        // the log text.
        io.emit('campaign-complete', { message: 'Scrape finished.' });
    });

    res.send({ status: 'started' });
});

// Build the queue for one category across the given states, skipping cities
// already recorded done so re-runs only touch what is genuinely new. Skipping
// whole states is just an optimisation - the per-city check below is what
// stops a half-finished state from having its done cities re-scraped.
//
// The query carries the state (and country) because a bare "Restaurants
// Birmingham" lets Google Maps pick the most prominent Birmingham worldwide -
// which is Birmingham, England. That filled the sheet with UK leads. Qualifying
// the query pins each search to the intended place.
function buildCategoryQueue(category, states, country) {
    const countryData = COUNTRY_STATE_CITIES[country] || {};
    const progress = loadProgress();
    const doneByState = progress[category] || {};
    const out = [];
    for (const state of states) {
        if (isStateComplete(category, state, country)) continue;
        const done = new Set(doneByState[state] || []);
        for (const city of (countryData[state] || [])) {
            if (done.has(city)) continue;
            out.push({
                query: `${category} ${city} ${state} ${country}`,
                category,
                state,
                city,
                trackerKey: `${category}|${state}`,
            });
        }
    }
    return out;
}

async function processNextInQueue() {
    if (isPaused) return;
    // /stop clears the queue and flips this flag. A timer may already be armed
    // from the previous job, so bail out here rather than emitting a bogus
    // "all queries completed" summary for a run the user cancelled.
    if (!isProcessingQueue) return;

    // Queue drained. If this campaign chains categories, advance to the next
    // one automatically; only finish when none are left.
    if (queryQueue.length === 0) {
        if (campaignChain && campaignChain.currentIndex < campaignChain.categories.length - 1) {
            const finished = campaignChain.categories[campaignChain.currentIndex];
            campaignChain.currentIndex += 1;
            const next = campaignChain.categories[campaignChain.currentIndex];
            const s = campaignStats;
            io.emit('log', `\n🏁 Category [${finished}] complete (${s.succeeded} succeeded, ${s.failed} failed). Moving to [${next}].`);

            const built = buildCategoryQueue(next, campaignChain.states, campaignCountry);
            if (built.length > 0) {
                queryQueue = built;
                campaignStats.total += built.length;
                persistPendingQueue();
                io.emit('log', `🎯 Next category: ${built.length} queries for [${next}].`);
                // Continue without a button click — that is the whole point.
                setTimeout(processNextInQueue, globalCampaignDelay);
                return;
            }
            // Nothing new for this category; try the one after it.
            return processNextInQueue();
        }

        isProcessingQueue = false;
        campaignChain = null;
        globalStateTracker = null;
        currentJob = null;
        // Campaign truly finished: nothing left to resume.
        saveCampaignState(null);
        // Keep the sync cursor so manual re-syncs stay incremental, but stop
        // binding future scrapes to this finished campaign file.
        sessionOutputFile = null;
        const s = campaignStats;
        if (s.failed > 0) {
            io.emit('log', `\n⚠ Campaign finished with ${s.failed} of ${s.total} queries failed: ${s.failedNames.join(', ')}`);
        } else {
            io.emit('log', `\n✅ All ${s.total} queued queries completed!`);
        }
        io.emit('campaign-complete', { message: 'Campaign finished.' });
        return;
    }

    const job = queryQueue.shift();
    currentJob = job;
    const currentQuery = job.query || job;
    // The job is now owned by a live process, so snapshot the remaining queue
    // before spawning. A crash mid-scrape resumes from the next pending job.
    persistPendingQueue();
    io.emit('log', `\n🚀 Queue: Starting next query -> ${currentQuery}`);

    // Pass the session output file so all queries save to the same file
    const args = [currentQuery];
    // Campaign queries are fully qualified ("Restaurants Birmingham Alabama
    // USA"), so suppress the area expansion - it keys on the city name alone
    // and would drag this search to Birmingham, England.
    args.push('--no-areas');
    // Label the leads with the city they came from; without this every
    // single-search lead is recorded as "initial" and the city is lost.
    if (job.city) args.push('--area-label', job.city);
    if (sessionOutputFile) {
        args.push('--output', sessionOutputFile);
    }
    if (globalSessionLimit > 0) {
        args.push('--limit', String(globalSessionLimit));
    }
    if (globalSessionProxy) {
        args.push('--proxy', globalSessionProxy);
    }

    scraperProcess = spawn('node', ['scraper.js', ...args]);

    scraperProcess.stdout.on('data', (data) => {
        io.emit('log', stripAnsi(data.toString()));
    });

    scraperProcess.stderr.on('data', (data) => {
        io.emit('log', '❌ Error: ' + stripAnsi(data.toString()));
    });

    scraperProcess.on('close', async (code) => {
        scraperProcess = null;
        if (code === 0) {
            campaignStats.succeeded += 1;
            io.emit('log', `\n✓ Completed: ${currentQuery}`);
        } else {
            campaignStats.failed += 1;
            campaignStats.failedNames.push(currentQuery);
            io.emit('log', `\n⚠ Failed: ${currentQuery} (Exit code ${code})`);
        }

        // Track progress per city, so partial state progress survives a stop
        // or restart instead of vanishing with the in-memory tracker.
        if (code === 0 && job.category && job.state && job.city) {
            recordCityDone(job.category, job.state, job.city);
        }

        // Persist what is still pending before moving on, so a crash anywhere
        // between here and the next job still leaves a resumable queue.
        currentJob = null;
        persistPendingQueue();

        // Automatically sync new data to Google Sheets after each query in queue
        console.log(`Triggering auto-sync for query: ${currentQuery}`);
        const syncResult = await syncNewLeadsToSheets(job.category);
        console.log(`Auto-sync complete: ${syncResult.count || 0} new leads synced (from ${syncResult.file || 'n/a'}).`);
        if (syncResult.error) {
            io.emit('log', `\n❌ Google Sheets sync FAILED: ${syncResult.error}`);
        } else {
            io.emit('log', `\n✅ Auto-synced ${syncResult.count || 0} new leads to Google Sheets${syncResult.file ? ` from ${syncResult.file}` : ''}.`);
        }

        // Small delay before next to prevent Google blocks
        setTimeout(processNextInQueue, globalCampaignDelay);
    });
}

app.post('/stop', (req, res) => {
    isPaused = false;
    // Count whatever was still pending as not-run so the summary below does not
    // claim queries completed that were actually cancelled.
    const remaining = queryQueue.length;
    queryQueue = []; // Cancel remaining queued queries
    isProcessingQueue = false;
    globalStateTracker = null;
    // A stop is deliberate: drop the resume snapshot so a restart does not pick
    // the campaign back up on its own. Only a crash leaves it behind.
    campaignChain = null;
    currentJob = null;
    saveCampaignState(null);
    sessionOutputFile = null;
    if (scraperProcess) {
        scraperProcess.kill();
        scraperProcess = null;
        if (remaining > 0) {
            io.emit('log', `\n🛑 Process stopped by user. Queue cleared (${remaining} quer${remaining === 1 ? 'y' : 'ies'} not started).`);
        } else {
            io.emit('log', '\n🛑 Process stopped by user. Queue cleared.');
        }
        res.send({ status: 'stopped' });
    } else {
        res.status(400).send('No process running to stop.');
    }
});

app.post('/campaign/pause', (req, res) => {
    if (!isProcessingQueue && !scraperProcess) return res.status(400).send('No campaign running to pause.');
    if (isPaused) return res.status(400).send('Already paused.');
    isPaused = true;
    // Don't kill the in-flight city - just prevent the next job from starting
    isProcessingQueue = false;
    try { persistPendingQueue(); } catch (_) {}
    try {
        const s = loadCampaignState();
        if (s) { s.paused = true; saveCampaignState(s); }
    } catch (_) {}
    io.emit('log', '\n⏸ Paused — finishing current city (if any), then holding. Hit Resume to continue.');
    res.json({ status: 'paused', remaining: queryQueue.length, inFlight: currentJob ? currentJob.query : null });
});

app.post('/campaign/resume', (req, res) => {
    if (!isPaused) return res.status(400).send('Not paused.');
    isPaused = false;
    isProcessingQueue = true;
    try {
        const s = loadCampaignState();
        if (s) { s.paused = false; saveCampaignState(s); }
    } catch (_) {}
    io.emit('log', '\n▶ Resumed.');
    if (!scraperProcess) processNextInQueue();
    res.json({ status: 'resumed', remaining: queryQueue.length });
});

app.get('/campaign/status', (req, res) => {
    res.json({ isProcessingQueue, isPaused, hasProcess: !!scraperProcess, remaining: queryQueue.length, inFlight: currentJob, chain: campaignChain, stats: campaignStats });
});

app.get('/files', (req, res) => {
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        return res.json([]);
    }
    try {
        const files = fs.readdirSync(outputDir)
            .filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'))
            .map(file => {
                const filePath = path.join(outputDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    date: stats.mtime,
                    size: stats.size
                };
            })
            .sort((a, b) => b.date - a.date);
        res.json(files);
    } catch (err) {
        res.status(500).send('Error reading output directory.');
    }
});

app.get('/leads', async (req, res) => {
    try {
        const fileName = req.query.file;
        let filePath;
        if (fileName) {
            filePath = path.join(__dirname, 'output', fileName);
            if (!fs.existsSync(filePath)) return res.status(404).send('File not found.');
        } else {
            filePath = await getLatestLeadFile();
        }

        if (!filePath) return res.status(404).send('No lead files found.');

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Leads') || workbook.worksheets[0];

        const leads = [];
        const headerRow = worksheet.getRow(1).values;

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const lead = {};
            row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                const header = headerRow[colNum];
                if (header) {
                    let val = cell.value;
                    if (val && typeof val === 'object') val = val.text || val.result || '';
                    lead[header] = val;
                }
            });

            // Commercial Grade: Lead Grading
            const hasPhone = lead['Phone 1'] && String(lead['Phone 1']).replace(/\D/g, '').length >= 7;
            const hasEmail = !!lead.Email;
            const hasWeb = lead.Website && lead.Website.length > 5;

            if (hasPhone && hasEmail && hasWeb) lead.grade = 'A';
            else if (hasPhone && (hasEmail || hasWeb)) lead.grade = 'B';
            else if (hasPhone) lead.grade = 'C';
            else lead.grade = 'D';

            leads.push(lead);
        });

        res.json(leads);
    } catch (err) {
        console.error('Error reading leads:', err);
        res.status(500).send('Error reading lead data.');
    }
});

app.get('/leads/stats', async (req, res) => {
    try {
        const filePath = await getLatestLeadFile();
        if (!filePath) return res.status(404).send('No lead files found.');

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Leads') || workbook.worksheets[0];

        const stats = {
            total: 0,
            hotTargets: 0,
            hasWebsite: 0,
            noPhone: 0
        };

        // Map header names -> column index so stats survive column reordering
        const headerRow = worksheet.getRow(1).values;
        const colIndex = {};
        headerRow.forEach((h, i) => {
            if (h) colIndex[String(h).trim()] = i;
        });
        const phoneCol = colIndex['Phone 1'] || colIndex['Phone'] || 12;
        const websiteCol = colIndex['Website'] || 15;

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            stats.total++;

            // Cells may be rich objects (e.g. Website is a { text, hyperlink }
            // cell), so flatten them before string tests.
            const flat = (v) => {
                if (v && typeof v === 'object') return v.text || v.result || '';
                return v;
            };

            const phones = flat(row.getCell(phoneCol).value) || [];
            const website = flat(row.getCell(websiteCol).value) || '';

            const phoneVal = Array.isArray(phones) ? phones.join('') : String(phones || '');
            const hasPhone = phoneVal.replace(/\D/g, '').length >= 7;
            const hasRealSite = website && typeof website === 'string' && website.length > 5 && !website.includes('facebook.com');

            if (!hasPhone) stats.noPhone++;
            else if (!hasRealSite) stats.hotTargets++;
            else stats.hasWebsite++;
        });

        res.json(stats);
    } catch (err) {
        console.error('Error calculating stats:', err);
        res.status(500).send('Error calculating stats.');
    }
});

app.get('/download', (req, res) => {
    const fileName = req.query.file;
    if (!fileName) return res.status(400).send('File name required.');
    const filePath = path.join(__dirname, 'output', fileName);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found.');
    }
    res.download(filePath);
});

app.delete('/api/files/:filename', (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(__dirname, 'output', fileName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found.');
    }

    try {
        fs.unlinkSync(filePath);
        res.send({ status: 'deleted' });
    } catch (err) {
        console.error('Error deleting file:', err);
        res.status(500).send('Error deleting file: ' + err.message);
    }
});

app.post('/leads/sync-gsheets', async (req, res) => {
    try {
        const fileName = req.query.file;
        // Optional: the campaign's category, so subtypes that match no known
        // group land on the campaign tab instead of spawning new sheets.
        const category = req.query.category;
        let filePath;
        if (fileName) {
            filePath = path.join(__dirname, 'output', fileName);
            if (!fs.existsSync(filePath)) return res.status(404).send('File not found.');
        } else {
            filePath = await getLatestLeadFile();
        }

        if (!filePath) return res.status(404).send('No lead files found to sync.');

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Leads') || workbook.worksheets[0];
        const headerRow = worksheet.getRow(1).values;

        const leads = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const lead = {};
            row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                const header = headerRow[colNum];
                if (header) {
                    let val = cell.value;
                    if (val && typeof val === 'object') val = val.text || val.result || '';
                    lead[header] = val;
                }
            });
            leads.push(lead);
        });

        const result = await appendLeadsToSheet(leads, { defaultTab: category || '' });
        res.json({
            status: 'success',
            syncedCount: result.count,
            skippedDuplicates: result.skippedDuplicates,
            tabs: result.tabs,
            message: `Successfully synced ${result.count} leads with emails to Google Sheets.`
        });
    } catch (err) {
        console.error('GSync Error:', err);
        res.status(500).send('Error syncing to Google Sheets: ' + err.message);
    }
});

app.post('/start-campaign', async (req, res) => {
    if (scraperProcess || isProcessingQueue) {
        return res.status(400).send('A scraping process or queue is already running.');
    }

    const { categories, states, delaySeconds, country } = req.body;

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
        return res.status(400).send('At least one category is required.');
    }
    if (!states || !Array.isArray(states) || states.length === 0) {
        return res.status(400).send('At least one state is required.');
    }

    const targetCountry = country || 'USA';
    const countryData = COUNTRY_STATE_CITIES[targetCountry];
    if (!countryData) return res.status(400).send('Invalid country.');

    // Build the queue for the first category only; the rest are queued up in
    // campaignChain and started by processNextInQueue when this one drains.
    campaignChain = { categories, currentIndex: 0, states };
    campaignCountry = targetCountry;

    queryQueue = buildCategoryQueue(categories[0], states, targetCountry);
    if (queryQueue.length === 0) {
        campaignChain = null;
        return res.status(400).send('No queries generated. The selected states may already be fully scraped — try different ones or reset progress.');
    }

    globalCampaignDelay = (parseInt(delaySeconds, 10) || 10) * 1000;
    globalStateTracker = null;
    isProcessingQueue = true;
    campaignStats = { total: queryQueue.length, succeeded: 0, failed: 0, failedNames: [] };

    // Session-wide settings forwarded to every scraper run in this queue
    globalSessionLimit = parseInt(req.body.limit, 10) || 0;
    globalSessionProxy = (req.body.proxy || '').split(',').map(p => p.trim()).filter(Boolean).join(',');

    // Capture current lead count
    sessionStartLeadCount = await getCurrentLeadCount();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    sessionOutputFile = path.join(__dirname, 'output', `Campaign_${targetCountry}_${timestamp}.xlsx`);

    // The campaign file is brand new and starts empty; reset the sync cursor for it
    await markSyncStart(sessionOutputFile);

    // Snapshot so a crash before the first job still resumes.
    persistPendingQueue();

    // Capture before processing starts: processNextInQueue pops the first job
    // immediately, so reading queryQueue.length afterwards always reports 0.
    const totalQueries = queryQueue.length;

    const remainingCats = categories.length - 1;
    io.emit('log', `\n🎯 Campaign Mode: ${totalQueries} queries for [${categories[0]}] across ${states.length} states.`);
    if (remainingCats > 0) {
        io.emit('log', `🔗 Chaining ${categories.length} categories: ${categories.join(' → ')}`);
    }
    io.emit('log', `📁 All results will be saved to: Campaign_${targetCountry}_${timestamp}.xlsx\n`);

    processNextInQueue();
    res.send({ status: 'queued', count: totalQueries, categories });
});

// Return which category|state pairs have already been scraped

function unsubPage({ variant, email, title, message, resubUrl }) {
    const esc = (t) => String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const isSuccess = variant === 'success';
    const isResub = variant === 'resub';
    let icon;
    if (isResub) {
      icon = '<div class="icon resub"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/><path d="M8 12l2 2 4-4"/></svg></div>';
    } else if (isSuccess) {
      icon = '<div class="icon ok"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>';
    } else {
      icon = '<div class="icon err"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>';
    }
    const heading = esc(title || (isResub ? "You\u0027re back!" : isSuccess ? "You\u0027re unsubscribed" : "Link issue"));
    const body = esc(message || (isResub ? "You\u0027ll start receiving emails again. Thanks for staying with us." : isSuccess ? "You won\u0027t receive further emails from this sender." : "This unsubscribe link looks invalid or expired."));
    const emailPill = email ? '<div class="pill">' + esc(email) + '</div>' : '';
    const year = new Date().getFullYear();
    let sub, actions;
    if (isResub) {
      sub = "You\u0027ve been resubscribed. You can unsubscribe again any time from any email we send.";
      actions = '<div class="actions"><a class="btn btn-primary" href="https://cotechagency.com" target="_blank" rel="noopener">Visit Cotech Agency</a><a class="btn btn-ghost" href="javascript:window.close()">Close tab</a></div>';
    } else if (isSuccess) {
      sub = "We\u0027ve removed you immediately. Changed your mind? You can resubscribe in one tap.";
      const resubBtn = resubUrl ? '<a class="btn btn-ghost" href="' + esc(resubUrl) + '">↩ Resubscribe</a>' : '';
      actions = '<div class="actions"><a class="btn btn-primary" href="https://cotechagency.com" target="_blank" rel="noopener">Visit Cotech Agency</a>' + resubBtn + '<a class="btn btn-ghost" href="javascript:window.close()">Close tab</a></div>';
    } else {
      sub = "If you were trying to unsubscribe, ask the sender for a fresh link \u2014 rotating credentials invalidates old ones.";
      actions = '<div class="actions"><a class="btn btn-primary" href="https://cotechagency.com" target="_blank" rel="noopener">Visit Cotech Agency</a><a class="btn btn-ghost" href="javascript:window.close()">Close tab</a></div>';
    }
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>' + heading + ' \u2014 Cotech Agency</title>'
+ '<style>*{box-sizing:border-box}html,body{height:100%}body{margin:0;font-family: ui-sans-system,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;padding:24px;}'
+ '.bg{position:fixed;inset:0;z-index:-1;background: radial-gradient(900px 500px at 20% 0%, rgba(99,102,241,.18), transparent 60%), radial-gradient(700px 400px at 95% 10%, rgba(168,85,247,.14), transparent 60%), radial-gradient(800px 600px at 50% 100%, rgba(14,165,233,.10), transparent 60%), linear-gradient(180deg,#f8fafc 0%, #eef2ff 100%);}'
+ '.card{width:min(520px,100%);background:white;border:1px solid #e2e8f0;border-radius:24px;box-shadow: 0 10px 30px rgba(15,23,42,.08), 0 1px 3px rgba(15,23,42,.06);overflow:hidden;animation:pop .36s ease-out;}'
+ '@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}'
+ '.accent{height:4px;background: linear-gradient(90deg,#6366f1,#a855f7,#06b6d4);}'
+ '.inner{padding:32px 28px 24px}'
+ '.top{display:flex;align-items:center;gap:10px;margin-bottom:4px}'
+ '.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.02em;font-size:13px;color:#475569;text-transform:uppercase}'
+ '.brand-logo{height:28px;width:auto;display:block;object-fit:contain}'
+ '.icon{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;box-shadow:0 8px 18px rgba(0,0,0,.12);margin:16px 0 14px}'
+ '.icon.ok{background: linear-gradient(135deg,#10b981,#059669);}'
+ '.icon.resub{background: linear-gradient(135deg,#6366f1,#06b6d4);}'
+ '.icon.err{background: linear-gradient(135deg,#f59e0b,#ef4444);}'
+ 'h1{margin:0 0 8px;font-size:26px;line-height:1.2;letter-spacing:-.02em;color:#0f172a}'
+ '.copy{margin:0;color:#475569;line-height:1.6;font-size:15px}'
+ '.pill{margin:14px 0 0;display:inline-flex;align-items:center;gap:8px;background:#f1f5f9;border:1px solid #e2e8f0;color:#334155;font-family: ui-monospace, SFMono-Regular, Menlo, monospace;font-size:13px;padding:8px 12px;border-radius:999px;max-width:100%;word-break:break-all}'
+ '.sub{margin:14px 0 0;color:#64748b;font-size:13.5px;line-height:1.6;background:#f8fafc;border:1px dashed #e2e8f0;border-radius:12px;padding:12px 14px}'
+ '.hint{margin:10px 0 0;color:#64748b;font-size:12.5px;line-height:1.5}'
+ '.hint a{color:#4f46e5;text-decoration:none}.hint a:hover{text-decoration:underline}'
+ '.actions{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap}'
+ '.btn{appearance:none;border:0;border-radius:12px;padding:11px 16px;font-weight:600;font-size:14px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .08s ease, box-shadow .15s ease, background .15s ease, color .15s ease}'
+ '.btn:active{transform:translateY(1px)}'
+ '.btn-primary{background:#0f172a;color:white;box-shadow:0 8px 18px rgba(15,23,42,.18)}'
+ '.btn-primary:hover{background:#111c33}'
+ '.btn-ghost{background:white;color:#334155;border:1px solid #e2e8f0}'
+ '.btn-ghost:hover{background:#f8fafc;border-color:#cbd5e1}'
+ '.footer{padding:14px 22px 18px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#94a3b8;font-size:12px}'
+ '.footer a{color:#64748b;text-decoration:none}.footer a:hover{color:#334155;text-decoration:underline}'
+ '@media (max-width:420px){ .inner{padding:26px 20px 18px} h1{font-size:22px} }'
+ '</style></head><body><div class="bg" aria-hidden="true"></div>'
+ '<main class="card" role="main" aria-labelledby="title"><div class="accent"></div><div class="inner">'
+ '<div class="top"><div class="brand"><img class="brand-logo" src="/cotech-logo-400.png" alt="Cotech Agency" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'"/><span style="display:none">Cotech Agency</span></div></div>'
+ icon + '<h1 id="title">' + heading + '</h1><p class="copy">' + body + '</p>' + emailPill + '<div class="sub">' + esc(sub) + '</div>'
+ (isSuccess ? '<p class="hint">Wrong address? <a href="mailto:kaira@cotechagency.com?subject=Resubscribe%20'+encodeURIComponent(email||'')+'">Email kaira@cotechagency.com</a> to fix it.</p>' : (isResub ? '<p class="hint">Changed your mind again? You can <a href="' + esc(resubUrl ? resubUrl.replace("/resubscribe","/unsubscribe") : "#") + '">unsubscribe again</a>.</p>' : ''))
+ actions
+ '</div><div class="footer"><span>\u00a9 ' + year + ' Cotech Agency \u00b7 kaira@cotechagency.com</span><span><a href="https://cotechagency.com" target="_blank" rel="noopener">cotechagency.com</a> \u00b7 Amritsar, India</span></div></main></body></html>';
}
function resubLink(email, secret, baseUrl) {
    const tok = require('crypto').createHmac('sha256', secret).update(email).digest('hex');
    const b = Buffer.from(email).toString('base64url');
    const base = String(baseUrl || '').replace(/\/$/, '') || '';
    return (base ? base : '') + '/resubscribe?e=' + b + '&t=' + tok;
}
function absBase(req) {
    try { const cfg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'email-config.json'),'utf8')); if (cfg.unsubscribe_base_url) return String(cfg.unsubscribe_base_url).replace(/\/$/, ''); } catch(_) {}
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    return proto + '://' + req.get('host');
}
// Unsubscribe handler for email campaigns — must be public and immediate (CAN-SPAM).
// Token is HMAC-SHA256(email, secret) matching email-marketing.js:unsubLink().
app.get('/unsubscribe', (req, res) => {
    try {
        const b = String(req.query.e || '');
        const tok = String(req.query.t || '');
        if (!b || !tok) return res.status(400).send(unsubPage({ variant:'error', title:'Invalid link', message:'This unsubscribe link is incomplete. Please use the full link from the email.' }));
        let email='';
        try { email = Buffer.from(b, 'base64url').toString('utf8').trim().toLowerCase(); } catch(_) { return res.status(400).send(unsubPage({ variant:'error', title:'Invalid link', message:'This link is malformed and could not be read.' })); }
        if (!email.includes('@')) return res.status(400).send(unsubPage({ variant:'error', title:'Invalid email', message:'This link does not contain a valid email address.' }));
        let secret = 'unsub-secret';
        try { const cfg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'email-config.json'),'utf8')); secret = cfg.unsubscribe_secret || cfg.smtp?.pass || secret; } catch (_) {}
        const expect = require('crypto').createHmac('sha256', secret).update(email).digest('hex');
        const ok = expect.length===tok.length && require('crypto').timingSafeEqual(Buffer.from(expect), Buffer.from(tok));
        if (!ok) return res.status(400).send(unsubPage({ variant:'error', title:'Link expired or invalid', message:'This token did not match. If credentials were rotated, request a fresh unsubscribe link.' }));
        const supPath = require('path').join(__dirname,'email-suppression.json');
        let sup={unsubscribed:{},bounced:{},manual:[]};
        try { if (require('fs').existsSync(supPath)) sup=JSON.parse(require('fs').readFileSync(supPath,'utf8')); } catch(_){}
        if (!sup.unsubscribed) sup.unsubscribed={};
        sup.unsubscribed[email]={at:new Date().toISOString(),detail:'via /unsubscribe link'};
        require('fs').writeFileSync(supPath, JSON.stringify(sup,null,2));
        const rUrl = resubLink(email, secret, absBase(req));
        res.send(unsubPage({ variant:'success', email, title:"You\u0027re unsubscribed", message: email + ' has been removed. You will not receive further emails from this sender.', resubUrl: rUrl }));
    } catch(e){ res.status(500).send(unsubPage({ variant:'error', title:'Something went wrong', message:'Unsubscribe failed: ' + e.message })); }
});

app.get('/resubscribe', (req, res) => {
    try {
        const b = String(req.query.e || '');
        const tok = String(req.query.t || '');
        if (!b || !tok) return res.status(400).send(unsubPage({ variant:'error', title:'Invalid link', message:'This resubscribe link is incomplete. Please use the full link from the unsubscribe page.' }));
        let email='';
        try { email = Buffer.from(b, 'base64url').toString('utf8').trim().toLowerCase(); } catch(_) { return res.status(400).send(unsubPage({ variant:'error', title:'Invalid link', message:'This link is malformed and could not be read.' })); }
        if (!email.includes('@')) return res.status(400).send(unsubPage({ variant:'error', title:'Invalid email', message:'This link does not contain a valid email address.' }));
        let secret = 'unsub-secret';
        try { const cfg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'email-config.json'),'utf8')); secret = cfg.unsubscribe_secret || cfg.smtp?.pass || secret; } catch (_) {}
        const expect = require('crypto').createHmac('sha256', secret).update(email).digest('hex');
        const ok = expect.length===tok.length && require('crypto').timingSafeEqual(Buffer.from(expect), Buffer.from(tok));
        if (!ok) return res.status(400).send(unsubPage({ variant:'error', title:'Link expired or invalid', message:'This token did not match. If credentials were rotated, request a fresh resubscribe link from the last email.' }));
        const supPath = require('path').join(__dirname,'email-suppression.json');
        let sup={unsubscribed:{},bounced:{},manual:[]};
        try { if (require('fs').existsSync(supPath)) sup=JSON.parse(require('fs').readFileSync(supPath,'utf8')); } catch(_){}
        let removed=false;
        if (sup.unsubscribed && sup.unsubscribed[email]) { delete sup.unsubscribed[email]; removed=true; }
        // Also clear a bounce block if they were bounced — resubscribing is explicit consent
        if (sup.bounced && sup.bounced[email]) { delete sup.bounced[email]; removed=true; }
        if (removed) require('fs').writeFileSync(supPath, JSON.stringify(sup,null,2));
        // Pass the opposite-direction link so they can toggle back
        let secret2=secret; try{ const cfg2=JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'email-config.json'),'utf8')); secret2=cfg2.unsubscribe_secret||cfg2.smtp?.pass||secret2;}catch(_){}
        const unsubTok=require('crypto').createHmac('sha256',secret2).update(email).digest('hex');
        const unsubB=Buffer.from(email).toString('base64url');
        const unsubUrl=absBase(req)+'/unsubscribe?e='+unsubB+'&t='+unsubTok;
        res.send(unsubPage({ variant:'resub', email, title:"You\u0027re back!", message: email + ' is resubscribed — you\u0027ll receive emails again.', resubUrl: unsubUrl }));
    } catch(e){ res.status(500).send(unsubPage({ variant:'error', title:'Something went wrong', message:'Resubscribe failed: ' + e.message })); }
});

// Pixel: GET /t/open?e=<base64url>&t=<hmac> — self-hosted open tracking
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
function sendPixel(res){
  res.setHeader('Content-Type','image/gif');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  res.setHeader('Content-Length', String(PIXEL_GIF.length));
  res.end(PIXEL_GIF);
}
app.get('/t/open', (req,res)=>{
  try{
    const { verifyPixel, recordOpen } = require('./email-events.js');
    const email = verifyPixel(req.query.e, req.query.t);
    if(email) recordOpen(email, { ip: req.ip||req.headers['x-forwarded-for']||'', ua: req.headers['user-agent']||'' });
  }catch(_){}
  sendPixel(res);
});
app.get('/t/o.gif', (req,res)=>{
  try{
    const token=String(req.query.t||req.query.token||'');
    const b=String(req.query.e||req.query.b||'');
    const { verifyPixel, recordOpen } = require('./email-events.js');
    const email = verifyPixel(b, token);
    if(email) recordOpen(email, { ip: req.ip||'', ua: req.headers['user-agent']||'' });
  }catch(_){}
  sendPixel(res);
});
app.get('/o.gif', (req,res)=>{
  try{
    const { verifyPixel, recordOpen } = require('./email-events.js');
    const email = verifyPixel(req.query.e, req.query.t);
    if(email) recordOpen(email, { ip: req.ip||'', ua: req.headers['user-agent']||'' });
  }catch(_){}
  sendPixel(res);
});

app.post('/unsubscribe/reply', (req, res) => {
    // For "reply STOP" flows: body { email: "a@b.com" } — used when someone replies STOP and you paste their address.
    try {
        const email = String(req.body?.email || req.body?.e || '').trim().toLowerCase();
        if (!email.includes('@')) return res.status(400).send('email required');
        const supPath = require('path').join(__dirname,'email-suppression.json');
        let sup={unsubscribed:{},bounced:{},manual:[]};
        try { if (require('fs').existsSync(supPath)) sup=JSON.parse(require('fs').readFileSync(supPath,'utf8')); } catch(_){}
        if (!sup.unsubscribed) sup.unsubscribed={};
        sup.unsubscribed[email]={at:new Date().toISOString(),detail:'reply STOP'};
        require('fs').writeFileSync(supPath, JSON.stringify(sup,null,2));
        res.json({status:'suppressed', email});
    } catch(e){ res.status(500).send(e.message); }
});

// ---------------------------------------------------------------------------
// Email campaign API — powers the Email tab


// Shared helpers live in email-core.js / email-sheet.js so the standalone
// email-campaign-tool cannot drift. The sheet Status column (G) is the
// source of truth for "already delivered": DELIVERED rows are not re-picked
// even when new rows are appended to the sheet.
function sanitizeCampaignName(raw){ let v=String(raw||"").trim().slice(0,80); v=v.split("/").join("-").split("\\").join("-"); v=v.replace(/[\n\r\t]+/g,"-"); v=v.replace(/\s+/g," ").trim(); if(!v) return new Date().toISOString().slice(0,10); v=v.replace(/[^\w\s\-\.\(\)]/g,"").replace(/\s+/g," ").trim(); return v.slice(0,60) || new Date().toISOString().slice(0,10); }
function emailOverviewData(opts = {}) {
    const cfgRaw = JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'email-config.json'),'utf8'));
    const sup = (()=>{ try{ return JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'email-suppression.json'),'utf8')); }catch(_){ return {unsubscribed:{},bounced:{},manual:[]}; }})();
    const sentLog = (()=>{ try{ return JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'email-sent-log.json'),'utf8')); }catch(_){ return {}; }})();
    const _rawCamp = String(cfgRaw.campaign_name||'').trim();
    const campaign = _rawCamp ? sanitizeCampaignName(_rawCamp) : new Date().toISOString().slice(0,10);
    return { cfgRaw, sup, sentLog, campaign };
}
async function computeEmailCounts(cfgRaw, sup, sentLog, campaign, resendFlag, opts={}) {
    const path2 = require('path');
    const fs2 = require('fs');
    const ExcelJS2 = require('exceljs');
    const { cleanLeads } = require('./email-core.js');
    const outDir = path2.join(__dirname,'output');
    let files = [];
    try { files = fs2.readdirSync(outDir).filter(f=>f.endsWith('.xlsx')).map(f=>path2.join(outDir,f)); } catch(_){ files=[]; }
    if (files.length===0) return { raw:0, withEmail:0, unique:0, sendable:0, direct:0, role:0, suppressed:0, deliveredInSheet:0, leads:[], stages:[], sheetStatuses: null };
    const rawLeads = [];
    for (const f of files) {
        try {
            const wb = new ExcelJS2.Workbook();
            await wb.xlsx.readFile(f);
            const ws = wb.worksheets[0];
            const header = ws.getRow(1).values;
            const idx={};
            header.forEach((h,i)=>{ if(!h) return; const k=String(h).trim().toLowerCase(); if(k==='name') idx.name=i; if(k==='email') idx.email=i; if(k==='category') idx.category=i; if(k==='area'||k==='scrapedfrom'){ if(idx.area==null) idx.area=i; } if(k==='website') idx.website=i; });
            ws.eachRow((row,n)=>{ if(n===1) return; const v=(i)=>{ const x=row.values[i]; if(x==null) return ''; return typeof x==='object'? String(x.text||x.result||''):String(x).trim(); }; rawLeads.push({ name:v(idx.name), email:v(idx.email), category:v(idx.category), area:v(idx.area), website:v(idx.website), source: path2.basename(f) }); });
        } catch(_){ }
    }
    const raw = rawLeads.length;
    const withEmail = rawLeads.filter(l=>l.email && l.email.includes('@')).length;
    let sheetStatuses = opts.sheetStatuses || null;
    let sheetByTab = opts.sheetByTab || null;
    if (!sheetStatuses && opts.useSheet !== false) {
        try { const { readSheetStatuses } = require('./email-sheet.js'); const r = await readSheetStatuses(); sheetStatuses = r.statuses; sheetByTab = r.byTab; } catch(_){}
    }
    const r2 = cleanLeads(rawLeads, sup, sentLog, { campaign, resend: !!resendFlag, sheetStatuses });
    return { raw, withEmail, unique: r2.pass2.length, sendable: r2.sendable.length, direct: r2.directCount, role: r2.roleCount, suppressed: r2.pass3.length - r2.notSup.length, suppressedOnly: r2.suppressedOnly||0, deliveredInSheet: r2.deliveredInSheet||0, leads: r2.sendable, sheetStatuses, sheetByTab };
}

// ---- SMTP verify cache (non-blocking for overview) ----
let __smtpCache = { ok: null, error: null, at: 0 };
let __smtpInFlight = null;
async function checkSmtp(cfg){
  if(__smtpInFlight) return __smtpInFlight;
  const host=cfg?.smtp?.host, port=cfg?.smtp?.port;
  if(!host||!port){ __smtpCache={ok:false,error:'smtp not configured',at:Date.now()}; return __smtpCache; }
  __smtpInFlight=(async()=>{
    const nm=require('nodemailer');
    const t=nm.createTransport({host,port,secure:port===465,auth:{user:cfg.smtp.user,pass:cfg.smtp.pass},tls:{rejectUnauthorized:false},connectionTimeout:7000,greetingTimeout:7000,socketTimeout:7000,requireTLS:port===587});
    try{
      await Promise.race([t.verify(), new Promise((_,rej)=> setTimeout(()=>rej(new Error('Timeout')),7500))]);
      __smtpCache={ok:true,error:null,at:Date.now()};
    }catch(e){ __smtpCache={ok:false,error:String(e.message||e).slice(0,400),at:Date.now()};}
    finally{ try{t.close()}catch(_){}; __smtpInFlight=null; }
    return __smtpCache;
  })();
  return __smtpInFlight;
}
function getCachedSmtp(){ return {ok:__smtpCache.ok,error:__smtpCache.error}; }

app.get('/email/overview', async (req, res) => {
    try {
        const useSheet = req.query.sheet !== '0';
        let sheetStatuses = null, sheetByTab = null, sheetOk = null, sheetErr = null;
        if (useSheet) {
            try { const { readSheetStatuses } = require('./email-sheet.js'); const r = await readSheetStatuses(); sheetStatuses = r.statuses; sheetByTab = r.byTab; sheetOk = true; } catch(e){ sheetOk = false; sheetErr = String(e.message||e).slice(0,400); }
        }
        const resend = req.query.resend === '1';
        const { cfgRaw, sup, sentLog, campaign } = emailOverviewData();
        const c = await computeEmailCounts(cfgRaw, sup, sentLog, campaign, resend, { sheetStatuses, sheetByTab, useSheet });
        let smtp_ok = null, smtp_error = null;
        try {
            const nm = require('nodemailer');
            const t = nm.createTransport({ host: cfgRaw.smtp.host, port: cfgRaw.smtp.port, secure: cfgRaw.smtp.port===465, auth:{user:cfgRaw.smtp.user, pass:cfgRaw.smtp.pass}, tls:{rejectUnauthorized:false}, connectionTimeout:9000, greetingTimeout:9000, socketTimeout:9000, requireTLS: cfgRaw.smtp.port===587 });
            await t.verify(); smtp_ok = true; try{t.close()}catch(_){}
        } catch(e){ smtp_ok = false; smtp_error = String(e.message||e).slice(0,500); }
        let preview = null;
        if (c.leads.length) {
            const lead = c.leads[0];
            try {
                const helpers = require('./email-marketing-helpers.js');
                const crypto2 = require('crypto');
                const { loadTemplates, templateForCategory } = require('./email-core.js');
                const templatesFile = loadTemplates();
                const fillTpl = (tpl, lead, cfg) => tpl
                    .replace(/\{\{sender_name\}\}/gi, cfg.sender_name||cfg.from?.name||'Komal')
                    .replace(/\{\{greeting\}\}/gi, helpers.greetingFor(lead))
                    .replace(/\{\{name\}\}/gi, lead.name||'there')
                    .replace(/\{\{first_name\}\}/gi, (lead.name||'there').split(/\s+/)[0])
                    .replace(/\{\{category\}\}/gi, lead.category||'your')
                    .replace(/\{\{area\}\}/gi, lead.area||'your area')
                    .replace(/\{\{website\}\}/gi, lead.website||'');
                const catTpl = templateForCategory(lead.category, templatesFile);
                const subjTpl = (catTpl && catTpl.subject) || cfgRaw.subject || 'Quick question about {{category}} work in {{area}}';
                const bodyTpl = (catTpl && catTpl.body) || cfgRaw.body || "{{greeting}},\n\nI came across {{name}} while looking at {{category}} businesses in {{area}} and wanted to reach out directly.\n\nI help local service businesses get more consistent work from Google Maps - the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.\n\nWorth a 10 minute call this week?\n\nBest,\n{{sender_name}}\n\n{{business_address}}\n\nYou are receiving this because we found {{name}} listed publicly. If you would rather not hear from us, reply with \"stop\" or unsubscribe here: {{unsubscribe_url}}";
                const htmlTpl = (catTpl && catTpl.body_html) || cfgRaw.body_html || '<div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;"><p>{{greeting}},</p><p>I came across <strong>{{name}}</strong> while looking at {{category}} businesses in {{area}} and wanted to reach out directly.</p><p>I help local service businesses get more consistent work from Google Maps &mdash; the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.</p><p>Worth a 10 minute call this week?</p><p>Best,<br>{{sender_name}}</p><p style="font-size: 12px; color: #666; margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px;">{{business_address}}<br>You are receiving this because {{name}} is listed publicly. <a href="{{unsubscribe_url}}">Unsubscribe</a>.</p></div>';
                const secret2 = cfgRaw.unsubscribe_secret || cfgRaw.smtp.pass || 'unsub-secret';
                const tok = crypto2.createHmac('sha256', secret2).update(lead.email).digest('hex');
                const b = Buffer.from(lead.email).toString('base64url');
                const baseUrl = String(cfgRaw.unsubscribe_base_url||'').replace(/\/$/,'') || (req.protocol+'://'+req.get('host'));
                const link = baseUrl + '/unsubscribe?e='+b+'&t='+tok;
                const subj = fillTpl(subjTpl, lead, cfgRaw);
                const plain = fillTpl(bodyTpl, lead, cfgRaw).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfgRaw.business_address||'');
                const html2 = fillTpl(htmlTpl, lead, cfgRaw).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfgRaw.business_address||'');
                const fullText = plain + '\n\n' + (cfgRaw.business_address||'') + '\n\nUnsubscribe: ' + link;
                preview = { to: lead.email, name: lead.name, category: lead.category, area: lead.area, subject: subj, text: fullText, html: html2 };
            } catch(_){ preview=null; }
        }
        // Engagement stats (delivered/bounced/opened/replied)
        let stats=null;
        try{ const { getStats }=require('./email-events.js'); stats=getStats(); }catch(_){}
        res.json({
            sendable: c.sendable, direct: c.direct, role: c.role, suppressed: c.suppressed, suppressedOnly: c.suppressedOnly||0, deliveredInSheet: c.deliveredInSheet,
            raw: c.raw, withEmail: c.withEmail, unique: c.unique,
            from: cfgRaw.from, reply_to: cfgRaw.reply_to, subject: cfgRaw.subject, smtp: cfgRaw.smtp,
            unsubscribe_base_url: cfgRaw.unsubscribe_base_url, business_address: cfgRaw.business_address,
            per_hour: cfgRaw.per_hour, per_batch: cfgRaw.per_batch, batch_pause_seconds: cfgRaw.batch_pause_seconds,
            campaign, preview, smtp_ok, smtp_error,
            sheet: useSheet ? { ok: sheetOk, error: sheetErr, statuses: sheetStatuses ? sheetStatuses.size : 0, delivered: c.deliveredInSheet } : { ok: null },
            stats,
            templates: (()=>{ try{ const { loadTemplates }=require('./email-core.js'); return Object.keys(loadTemplates().templates||{}); }catch(_){ return []; } })()
        });
    } catch(e){ res.status(500).send('overview failed: '+e.message); }
});

app.get('/email/preview', async (req,res)=>{
    try{
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit,10)||5));
        const resend = req.query.resend==='1';
        const useSheet = req.query.sheet !== '0';
        let sheetStatuses=null, sheetByTab=null;
        if (useSheet) { try{ const { readSheetStatuses }=require('./email-sheet.js'); const r=await readSheetStatuses(); sheetStatuses=r.statuses; sheetByTab=r.byTab; }catch(_){} }
        const { cfgRaw, sup, sentLog, campaign } = emailOverviewData();
        const c = await computeEmailCounts(cfgRaw, sup, sentLog, campaign, resend, { sheetStatuses, sheetByTab, useSheet });
        const slice = c.leads.slice(0, limit);
        const helpers = require('./email-marketing-helpers.js');
        const crypto2 = require('crypto');
        const { loadTemplates, templateForCategory } = require('./email-core.js');
        const templatesFile = loadTemplates();
        const fillTpl = (tpl, lead, cfg) => tpl
            .replace(/\{\{sender_name\}\}/gi, cfg.sender_name||cfg.from?.name||'Komal')
            .replace(/\{\{greeting\}\}/gi, helpers.greetingFor(lead))
            .replace(/\{\{name\}\}/gi, lead.name||'there')
            .replace(/\{\{first_name\}\}/gi, (lead.name||'there').split(/\s+/)[0])
            .replace(/\{\{category\}\}/gi, lead.category||'your')
            .replace(/\{\{area\}\}/gi, lead.area||'your area')
            .replace(/\{\{website\}\}/gi, lead.website||'');
        const secret2 = cfgRaw.unsubscribe_secret || cfgRaw.smtp.pass || 'unsub-secret';
        const baseUrl = String(cfgRaw.unsubscribe_base_url||'').replace(/\/$/,'') || (req.protocol+'://'+req.get('host'));
        const rows = slice.map(lead=>{
            const catTpl = templateForCategory(lead.category, templatesFile);
            const subjTpl = (catTpl && catTpl.subject) || cfgRaw.subject || 'Quick question about {{category}} work in {{area}}';
            const bodyTpl = (catTpl && catTpl.body) || cfgRaw.body || "{{greeting}},\n\nI came across {{name}} while looking at {{category}} businesses in {{area}} and wanted to reach out directly.\n\nI help local service businesses get more consistent work from Google Maps - the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.\n\nWorth a 10 minute call this week?\n\nBest,\n{{sender_name}}\n\n{{business_address}}\n\nYou are receiving this because we found {{name}} listed publicly. If you would rather not hear from us, reply with \"stop\" or unsubscribe here: {{unsubscribe_url}}";
            const htmlTpl = (catTpl && catTpl.body_html) || cfgRaw.body_html || '<div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;"><p>{{greeting}},</p><p>I came across <strong>{{name}}</strong> while looking at {{category}} businesses in {{area}} and wanted to reach out directly.</p><p>I help local service businesses get more consistent work from Google Maps &mdash; the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.</p><p>Worth a 10 minute call this week?</p><p>Best,<br>{{sender_name}}</p><p style="font-size: 12px; color: #666; margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px;">{{business_address}}<br>You are receiving this because {{name}} is listed publicly. <a href="{{unsubscribe_url}}">Unsubscribe</a>.</p></div>';
            const tok = crypto2.createHmac('sha256', secret2).update(lead.email).digest('hex');
            const b = Buffer.from(lead.email).toString('base64url');
            const link = baseUrl + '/unsubscribe?e='+b+'&t='+tok;
            const { signPixel } = require('./email-events.js');
            const pix = signPixel(lead.email);
            const pixelUrl = baseUrl + '/t/open?e=' + pix.b + '&t=' + pix.tok;
            const subj = fillTpl(subjTpl, lead, cfgRaw);
            const plain = fillTpl(bodyTpl, lead, cfgRaw).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfgRaw.business_address||'');
            let html2 = fillTpl(htmlTpl, lead, cfgRaw).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfgRaw.business_address||'');
            const pixelTag = '<img src="'+pixelUrl+'" width="1" height="1" style="display:none" alt="" />';
            html2 = html2.includes('</div>') ? html2.replace('</div>', pixelTag + '</div>') : html2 + pixelTag;
            const fullText = plain + '\n\n' + (cfgRaw.business_address||'') + '\n\nUnsubscribe: ' + link;
            return { to: lead.email, name: lead.name, category: lead.category, area: lead.area, website: lead.website, subject: subj, text: fullText, html: html2, source: lead.source, pixelUrl };
        });
        res.json({ sendable: c.sendable, deliveredInSheet: c.deliveredInSheet, leads: rows });
    } catch(e){ res.status(500).send('preview failed: '+e.message); }
});

app.post('/email/run', async (req,res)=>{
    const mode = String(req.body?.mode||'dry');
    const limit = Math.min(10000, Math.max(1, parseInt(req.body?.limit,10)||5));
    const resend = !!req.body?.resend;
    const useSheet = req.body?.sheet !== false && req.body?.sheet !== '0';
    const writeSheet = !!req.body?.writeSheet;
    const isDry = mode !== 'send';
    res.setHeader('Content-Type','application/x-ndjson');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Connection','keep-alive');
    const sendJSON = (obj)=>{ try{ res.write(JSON.stringify(obj)+'\n'); }catch(_){ } };

    let transport=null;
    try{
        let { cfgRaw, sup, sentLog, campaign } = emailOverviewData();
        { const _override=String(req.body?.campaign||'').trim(); if(_override) campaign = sanitizeCampaignName(_override); }
        const { loadTemplates, templateForCategory } = require('./email-core.js');
        const templatesFile = loadTemplates();
        let sheetStatuses=null, sheetByTab=null;
        if (useSheet) {
            try { const { readSheetStatuses }=require('./email-sheet.js'); const r=await readSheetStatuses(); sheetStatuses=r.statuses; sheetByTab=r.byTab; } catch(e){ sendJSON({type:'error', message:'Sheet read failed: '+String(e.message||e).slice(0,400)}); res.end(); return; }
        }
        const c = await computeEmailCounts(cfgRaw, sup, sentLog, campaign, resend, { sheetStatuses, sheetByTab, useSheet });
        const total = Math.min(limit, c.leads.length);
        const slice = c.leads.slice(0, total);
        sendJSON({ type:'overview', sendable: c.sendable, direct: c.direct, role: c.role, suppressed: c.suppressed, deliveredInSheet: c.deliveredInSheet, total, sheet: sheetStatuses?{ ok:true, statuses: sheetStatuses.size }:null });

        if (slice.length) {
            const helpers = require('./email-marketing-helpers.js');
            const crypto2 = require('crypto');
            const fillTpl=(tpl,lead,cfg)=> tpl.replace(/\{\{sender_name\}\}/gi,cfg.sender_name||cfg.from?.name||'Komal').replace(/\{\{greeting\}\}/gi,helpers.greetingFor(lead)).replace(/\{\{name\}\}/gi,lead.name||'there').replace(/\{\{first_name\}\}/gi,(lead.name||'there').split(/\s+/)[0]).replace(/\{\{category\}\}/gi,lead.category||'your').replace(/\{\{area\}\}/gi,lead.area||'your area').replace(/\{\{website\}\}/gi,lead.website||'');
            const catTpl = templateForCategory(slice[0].category, templatesFile);
            const subjTpl = (catTpl && catTpl.subject) || cfgRaw.subject || 'Quick question about {{category}} work in {{area}}';
            const bodyTpl = (catTpl && catTpl.body) || cfgRaw.body || "{{greeting}},\n\nI came across {{name}} while looking at {{category}} businesses in {{area}} and wanted to reach out directly.\n\nI help local service businesses get more consistent work from Google Maps - the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.\n\nWorth a 10 minute call this week?\n\nBest,\n{{sender_name}}\n\n{{business_address}}\n\nYou are receiving this because we found {{name}} listed publicly. If you would rather not hear from us, reply with \"stop\" or unsubscribe here: {{unsubscribe_url}}";
            const htmlTpl = (catTpl && catTpl.body_html) || cfgRaw.body_html || '<div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;"><p>{{greeting}},</p><p>I came across <strong>{{name}}</strong> while looking at {{category}} businesses in {{area}} and wanted to reach out directly.</p><p>I help local service businesses get more consistent work from Google Maps &mdash; the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.</p><p>Worth a 10 minute call this week?</p><p>Best,<br>{{sender_name}}</p><p style="font-size: 12px; color: #666; margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px;">{{business_address}}<br>You are receiving this because {{name}} is listed publicly. <a href="{{unsubscribe_url}}">Unsubscribe</a>.</p></div>';
            const secret2 = cfgRaw.unsubscribe_secret || cfgRaw.smtp.pass || 'unsub-secret';
            const baseUrl = String(cfgRaw.unsubscribe_base_url||'').replace(/\/$/,'') || (req.protocol+'://'+req.get('host'));
            const tok=crypto2.createHmac('sha256',secret2).update(slice[0].email).digest('hex');
            const b=Buffer.from(slice[0].email).toString('base64url');
            const link=baseUrl+'/unsubscribe?e='+b+'&t='+tok;
            const { signPixel: signPixPreview } = require('./email-events.js');
            const pixPreview = signPixPreview(slice[0].email);
            const pixelUrlPreview = baseUrl + '/t/open?e=' + pixPreview.b + '&t=' + pixPreview.tok;
            const subj=fillTpl(subjTpl, slice[0], cfgRaw);
            const plain=fillTpl(bodyTpl, slice[0], cfgRaw).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfgRaw.business_address||'');
            let html2=fillTpl(htmlTpl, slice[0], cfgRaw).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfgRaw.business_address||'');
            const pTagPrev='<img src="'+pixelUrlPreview+'" width="1" height="1" style="display:none" alt="" />';
            html2 = html2.includes('</div>') ? html2.replace('</div>', pTagPrev + '</div>') : html2 + pTagPrev;
            sendJSON({ type:'preview', sendable: c.sendable, lead: { to:slice[0].email, name:slice[0].name, category:slice[0].category, area:slice[0].area, subject:subj, text: plain+'\n\n'+(cfgRaw.business_address||'')+'\n\nUnsubscribe: '+link, html:html2 }});
        }

        if (!isDry) {
            try{
                const nm=require('nodemailer');
                transport={ kind:'nodemailer', t: nm.createTransport({ host:cfgRaw.smtp.host, port:cfgRaw.smtp.port, secure:cfgRaw.smtp.port===465, auth:{user:cfgRaw.smtp.user, pass:cfgRaw.smtp.pass}, tls:{rejectUnauthorized:false}, connectionTimeout:10000, greetingTimeout:10000, socketTimeout:15000 })};
            } catch(_){
                throw new Error('nodemailer not available — install it: npm i nodemailer');
            }
            const helpers = require('./email-marketing-helpers.js');
            const crypto2=require('crypto');
            const fillTpl=(tpl,lead,cfg)=> tpl.replace(/\{\{sender_name\}\}/gi,cfg.sender_name||cfg.from?.name||'Komal').replace(/\{\{greeting\}\}/gi,helpers.greetingFor(lead)).replace(/\{\{name\}\}/gi,lead.name||'there').replace(/\{\{first_name\}\}/gi,(lead.name||'there').split(/\s+/)[0]).replace(/\{\{category\}\}/gi,lead.category||'your').replace(/\{\{area\}\}/gi,lead.area||'your area').replace(/\{\{website\}\}/gi,lead.website||'');
            const secret2 = cfgRaw.unsubscribe_secret || cfgRaw.smtp.pass || 'unsub-secret';
            const baseUrl = String(cfgRaw.unsubscribe_base_url||'').replace(/\/$/,'') || (req.protocol+'://'+req.get('host'));
            const perBatch = cfgRaw.per_batch||50;
            const pauseMs = (cfgRaw.batch_pause_seconds||30)*1000;
            const supPath = require('path').join(__dirname,'email-suppression.json');
            const sentPath = require('path').join(__dirname,'email-sent-log.json');
            let supLive = (()=>{ try{return JSON.parse(require('fs').readFileSync(supPath,'utf8'));}catch(_){return {unsubscribed:{},bounced:{},manual:[]}; }})();
            let sentLive = (()=>{ try{return JSON.parse(require('fs').readFileSync(sentPath,'utf8'));}catch(_){return {};} })();
            let sent=0, failed=0;
            const sheetWrites=[];
            for (let i=0;i<slice.length;i++){
                const lead=slice[i];
                const catTpl = templateForCategory(lead.category, templatesFile);
                const subjTpl = (catTpl && catTpl.subject) || cfgRaw.subject || 'Quick question about {{category}} work in {{area}}';
                const bodyTpl = (catTpl && catTpl.body) || cfgRaw.body || "{{greeting}},\n\nI came across {{name}} while looking at {{category}} businesses in {{area}} and wanted to reach out directly.\n\nI help local service businesses get more consistent work from Google Maps - the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.\n\nWorth a 10 minute call this week?\n\nBest,\n{{sender_name}}\n\n{{business_address}}\n\nYou are receiving this because we found {{name}} listed publicly. If you would rather not hear from us, reply with \"stop\" or unsubscribe here: {{unsubscribe_url}}";
                const htmlTpl = (catTpl && catTpl.body_html) || cfgRaw.body_html || '<div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;"><p>{{greeting}},</p><p>I came across <strong>{{name}}</strong> while looking at {{category}} businesses in {{area}} and wanted to reach out directly.</p><p>I help local service businesses get more consistent work from Google Maps &mdash; the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.</p><p>Worth a 10 minute call this week?</p><p>Best,<br>{{sender_name}}</p><p style="font-size: 12px; color: #666; margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px;">{{business_address}}<br>You are receiving this because {{name}} is listed publicly. <a href="{{unsubscribe_url}}">Unsubscribe</a>.</p></div>';
                const tok=crypto2.createHmac('sha256',secret2).update(lead.email).digest('hex');
                const b=Buffer.from(lead.email).toString('base64url');
                const link=baseUrl+'/unsubscribe?e='+b+'&t='+tok;
                const { signPixel: signPixLoop } = require('./email-events.js');
                const pixLoop = signPixLoop(lead.email);
                const pixelUrlLoop = baseUrl + '/t/open?e=' + pixLoop.b + '&t=' + pixLoop.tok;
                const subj=fillTpl(subjTpl, lead, cfgRaw);
                const plain=fillTpl(bodyTpl, lead, cfgRaw).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfgRaw.business_address||'');
                let html2=fillTpl(htmlTpl, lead, cfgRaw).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfgRaw.business_address||'');
                const pTagLoop='<img src="'+pixelUrlLoop+'" width="1" height="1" style="display:none" alt="" />';
                html2 = html2.includes('</div>') ? html2.replace('</div>', pTagLoop + '</div>') : html2 + pTagLoop;
                const fullText=plain+'\n\n'+(cfgRaw.business_address||'')+'\n\nUnsubscribe: '+link;
                // Determine sheet tab/row for this lead (for events)
                let evTab='', evRow=null;
                if (sheetByTab) {
                    for(const [tab, info2] of sheetByTab.entries()){
                        const r=info2.rowByEmail.get(lead.email.trim().toLowerCase());
                        if(r){ evTab=tab; evRow=r; break; }
                    }
                }
                const mid = '<' + crypto2.randomUUID() + '@cotechagency.com>';
                const msg={ from: (cfgRaw.from.name+' <'+cfgRaw.from.address+'>'), to: lead.email, replyTo: cfgRaw.reply_to||cfgRaw.from.address, subject: subj, text: fullText, html: html2, headers:{'X-Campaign': campaign}, messageId: mid };
                try{
                    const info = await transport.t.sendMail(msg);
                    sent++;
                    sentLive[lead.email.trim().toLowerCase()]={ campaign, at: new Date().toISOString(), name: lead.name, area: lead.area };
                    try{ require('fs').writeFileSync(sentPath, JSON.stringify(sentLive, null, 2)); }catch(_){}
                    try{ const { recordSent }=require('./email-events.js'); recordSent(lead.email, { campaign, category: lead.category, area: lead.area, name: lead.name, tab: evTab, row: evRow, messageId: info.messageId||mid, detail: String(info.response||'').slice(0,300) }); }catch(_){}
                    if (writeSheet && sheetByTab) {
                        for(const [tab, info2] of sheetByTab.entries()){
                            const row=info2.rowByEmail.get(lead.email.trim().toLowerCase());
                            if(row){ sheetWrites.push({ tab, row, status:'DELIVERED' }); break; }
                        }
                    }
                    sendJSON({ type:'progress', sent, failed, total, email: lead.email, ok:true, id: info.messageId||info.response });
                } catch(err){
                    failed++;
                    const msg2=String(err.message||err);
                    try{ const { recordBounce }=require('./email-events.js'); recordBounce(lead.email, { reason: msg2.slice(0,400) }); }catch(_){}
                    if (/unknown|does not exist|invalid|no such/i.test(msg2) || err.responseCode===550 || err.responseCode===551) {
                        const eKey=lead.email.trim().toLowerCase();
                        if (!supLive.bounced) supLive.bounced={};
                        supLive.bounced[eKey]={at:new Date().toISOString(), detail: msg2.slice(0,300)};
                        try{ require('fs').writeFileSync(supPath, JSON.stringify(supLive,null,2)); }catch(_){}
                    }
                    sendJSON({ type:'progress', sent, failed, total, email: lead.email, ok:false, error: msg2.slice(0,500) });
                }
                if ((i+1)%perBatch===0 && i+1<slice.length){
                    sendJSON({ type:'batch_pause', seconds: Math.round(pauseMs/1000) });
                    await new Promise(r=>setTimeout(r, pauseMs));
                }
            }
            try{ transport.t.close(); }catch(_){}
            if (writeSheet && sheetWrites.length) {
                try {
                    const keySet=new Set(); const dedup=[];
                    for(const w of sheetWrites){ const k=w.tab+'\x00'+w.row; if(keySet.has(k)) continue; keySet.add(k); dedup.push(w); }
                    const { writeStatuses }=require('./email-sheet.js');
                    await writeStatuses(dedup);
                    sendJSON({ type:'sheet_write', count: dedup.length });
                } catch(e){ sendJSON({ type:'sheet_write_error', message: String(e.message||e).slice(0,400) }); }
            }
            sendJSON({ type:'done', sent, failed, total });
        } else {
            sendJSON({ type:'done', sent:0, failed:0, total: slice.length, dry:true });
        }
        res.end();
    } catch(e){
        try{ res.write(JSON.stringify({ type:'error', message: String(e.message||e).slice(0,600) })+'\n'); }catch(_){}
        try{ res.end(); }catch(_){}
    }
});


// ---- Email stats + events ----
app.get('/email/health/smtp', async (req,res)=>{ try{ const cfgRaw=JSON.parse(fs.readFileSync(path.join(__dirname,'email-config.json'),'utf8')); const r=await checkSmtp(cfgRaw); res.json({ok:r.ok,error:r.error,at:r.at}); }catch(e){ res.status(500).json({ok:false,error:String(e.message||e).slice(0,400)});} });

app.get('/email/stats', (req,res)=>{
  try{
    const { getStats }=require('./email-events.js');
    const s=getStats();
    // also expose suppressedOnly / deliveredInSheet from current sheet view
    let sheetStatuses=null;
    try{ sheetStatuses=require('./email-sheet.js'); }catch(_){}
    res.json(s);
  }catch(e){ res.status(500).send(e.message); }
});
app.get('/email/events', (req,res)=>{
  try{
    const { loadEvents }=require('./email-events.js');
    const q=String(req.query.q||'').toLowerCase().trim();
    const campaign=String(req.query.campaign||'').trim();
    const tab=String(req.query.tab||'').trim();
    const limit=Math.min(500, Math.max(1, parseInt(req.query.limit,10)||100));
    const offset=Math.max(0, parseInt(req.query.offset,10)||0);
    let vals=Object.values(loadEvents()).filter(v=>v && v.email);
    if(campaign) vals=vals.filter(v=> String(v.campaign||'')===campaign);
    if(tab) vals=vals.filter(v=> String(v.tab||'').toLowerCase()===tab.toLowerCase());
    if(q) vals=vals.filter(v=> String(v.email||'').toLowerCase().includes(q) || String(v.name||'').toLowerCase().includes(q));
    vals.sort((a,b)=> String(b.sentAt||'').localeCompare(String(a.sentAt||'')));
    const total=vals.length;
    vals=vals.slice(offset, offset+limit);
    res.json({ total, offset, limit, events: vals });
  }catch(e){ res.status(500).send(e.message); }
});
app.get('/email/export/csv', (req,res)=>{
  try{
    const { loadEvents }=require('./email-events.js');
    const vals=Object.values(loadEvents()).filter(v=>v && v.email);
    const esc=v=> '"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const header=['email','name','category','area','tab','campaign','sentAt','messageId','smtp','bouncedAt','openCount','firstOpenAt','lastOpenAt','repliedAt','replySubject'];
    let csv=header.join(',')+'\n';
    for(const v of vals){
      csv+=[esc(v.email),esc(v.name),esc(v.category),esc(v.area),esc(v.tab),esc(v.campaign),esc(v.sentAt),esc(v.messageId),esc(v.smtp),esc(v.bouncedAt),esc(v.openCount),esc(v.firstOpenAt),esc(v.lastOpenAt),esc(v.repliedAt),esc(v.replySubject)].join(',')+'\n';
    }
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="email-events.csv"');
    res.send(csv);
  }catch(e){ res.status(500).send(e.message); }
});
app.post('/email/imap/poll', async (req,res)=>{
  try{
    const { pollOnce }=require('./email-imap-poller.js');
    const r=await pollOnce();
    res.json(r);
  }catch(e){ res.status(500).json({ error: String(e.message||e).slice(0,400) }); }
});
app.get('/email/imap/status', (req,res)=>{
  try{
    const fs2=require('fs'), path2=require('path');
    let st=null;
    try{ st=JSON.parse(fs2.readFileSync(path2.join(__dirname,'email-imap-state.json'),'utf8')); }catch(_){}
    const { loadImapConfig }=require('./email-imap-poller.js');
    const cfg=loadImapConfig();
    res.json({ state: st, imapConfigured: !!cfg, host: cfg?cfg.host:null });
  }catch(e){ res.status(500).send(e.message); }
});

// ---- Email campaigns (history grouped from events) ----
app.get('/email/campaigns', (req,res)=>{
  try{
    const { listCampaigns }=require('./email-campaigns.js');
    res.json({ campaigns: listCampaigns() });
  }catch(e){ res.status(500).send(e.message); }
});
app.get('/email/campaigns/:campaign', (req,res)=>{
  try{
    const { getCampaign, listEmails }=require('./email-campaigns.js');
    const name=String(req.params.campaign||'').trim();
    const c=getCampaign(name);
    if(!c) return res.status(404).send('no such campaign: '+name);
    const q=String(req.query.q||'');
    const status=String(req.query.status||'');
    const limit=parseInt(req.query.limit,10)||50;
    const offset=parseInt(req.query.offset,10)||0;
    const sortBy=String(req.query.sortBy||'sentAt');
    const dir=String(req.query.dir||'desc');
    const r=listEmails(name,{ q:q, status:status, limit:limit, offset:offset, sortBy:sortBy, dir:dir });
    res.json({ campaign: c, emails: r });
  }catch(e){ res.status(500).send(e.message); }
});
app.get('/email/email/:email', (req,res)=>{
  try{
    const { getEmail }=require('./email-campaigns.js');
    const e=getEmail(String(req.params.email||''));
    if(!e) return res.status(404).send('no such email');
    res.json(e);
  }catch(e2){ res.status(500).send(e2.message); }
});
// Back-compat: old ?campaign= style still works via /email/events
// ---- Email templates CRUD (shared email-templates.json) ----
app.get('/api/templates', (req,res)=>{
    try{
        const { loadTemplates } = require('./email-core.js');
        res.json(loadTemplates());
    }catch(e){ res.status(500).send(e.message); }
});
app.get('/api/templates/:category', (req,res)=>{
    try{
        const { loadTemplates, templateForCategory } = require('./email-core.js');
        const tf=loadTemplates();
        const tpl=templateForCategory(req.params.category, tf);
        if(!tpl) return res.status(404).send('no template for '+req.params.category);
        res.json({ category: req.params.category, ...tpl });
    }catch(e){ res.status(500).send(e.message); }
});
app.put('/api/templates/:category', (req,res)=>{
    const cat=String(req.params.category||'').trim();
    if(!cat) return res.status(400).send('category required');
    const { subject, body, body_html } = req.body||{};
    if(typeof subject!=='string' || typeof body!=='string') return res.status(400).send('subject and body required');
    const p=require('path').join(__dirname,'email-templates.json');
    let data; try{ data=JSON.parse(require('fs').readFileSync(p,'utf8')); }catch(_){ data={templates:{}}; }
    if(!data.templates) data.templates={};
    data.templates[cat]={subject, body, body_html: body_html||''};
    require('fs').writeFileSync(p, JSON.stringify(data,null,2));
    res.json({ok:true, category:cat});
});
app.delete('/api/templates/:category', (req,res)=>{
    const cat=String(req.params.category||'').trim();
    const p=require('path').join(__dirname,'email-templates.json');
    let data; try{ data=JSON.parse(require('fs').readFileSync(p,'utf8')); }catch(_){ return res.status(404).send('no templates file'); }
    if(!data.templates || !data.templates[cat]) return res.status(404).send('no such template');
    delete data.templates[cat];
    require('fs').writeFileSync(p, JSON.stringify(data,null,2));
    res.json({ok:true});
});
app.get('/api/config', (req,res)=>{
    try{
        const cfg=JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'email-config.json'),'utf8'));
        const safe={...cfg, smtp:{...cfg.smtp, pass: cfg.smtp.pass ? 'REDACTED' : ''}};
        res.json(safe);
    }catch(e){ res.status(500).send(e.message); }
});
app.put('/api/config', (req,res)=>{
    try{
        const fp=require('path').join(__dirname,'email-config.json');
        let cfg=JSON.parse(require('fs').readFileSync(fp,'utf8'));
        const raw=String(req.body?.campaign_name ?? req.body?.campaign ?? '').trim();
        const hasCamp = req.body && (Object.prototype.hasOwnProperty.call(req.body,'campaign_name') || Object.prototype.hasOwnProperty.call(req.body,'campaign'));
        if(hasCamp){
            if(!raw) delete cfg.campaign_name;
            else cfg.campaign_name=sanitizeCampaignName(raw);
            require('fs').writeFileSync(fp, JSON.stringify(cfg,null,2));
        }
        res.json({ ok:true, campaign: (String(cfg.campaign_name||'').trim() ? sanitizeCampaignName(cfg.campaign_name) : new Date().toISOString().slice(0,10)), campaign_name: cfg.campaign_name||null });
    }catch(e){ res.status(500).json({ ok:false, error:String(e.message||e).slice(0,400)}); }
});
app.put('/email/config', (req,res)=>{
    try{
        const fp=require('path').join(__dirname,'email-config.json');
        let cfg=JSON.parse(require('fs').readFileSync(fp,'utf8'));
        const raw=String(req.body?.campaign_name ?? req.body?.campaign ?? '').trim();
        const hasCamp = req.body && (Object.prototype.hasOwnProperty.call(req.body,'campaign_name') || Object.prototype.hasOwnProperty.call(req.body,'campaign'));
        if(hasCamp){
            if(!raw) delete cfg.campaign_name;
            else cfg.campaign_name=sanitizeCampaignName(raw);
            require('fs').writeFileSync(fp, JSON.stringify(cfg,null,2));
        }
        res.json({ ok:true, campaign: (String(cfg.campaign_name||'').trim() ? sanitizeCampaignName(cfg.campaign_name) : new Date().toISOString().slice(0,10)), campaign_name: cfg.campaign_name||null });
    }catch(e){ res.status(500).json({ ok:false, error:String(e.message||e).slice(0,400)}); }
});

app.get('/campaign/progress', (req, res) => {
    res.json(loadProgress());
});

// Clear saved progress (useful when starting a fresh strategy)
app.post('/campaign/progress/reset', (req, res) => {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            fs.copyFileSync(PROGRESS_FILE, PROGRESS_FILE + '.backup-' + ts + '.json');
        }
    } catch (_) {}
    saveProgress({});
    res.json({ status: 'cleared' });
});

app.post('/leads/update', async (req, res) => {
    try {
        const { leadId, updateData } = req.body;
        if (!leadId || !updateData) {
            return res.status(400).send('leadId and updateData are required.');
        }

        const filePath = await getLatestLeadFile();
        if (!filePath) return res.status(404).send('No lead files found.');

        // Safety Backup
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const base = path.basename(filePath, ext);
        const backupPath = path.join(dir, `${base}.BACKUP-${Date.now()}${ext}`);
        fs.copyFileSync(filePath, backupPath);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Leads') || workbook.worksheets[0];

        await ensureCrmColumns(worksheet);

        const headerRow = worksheet.getRow(1).values;
        const colMap = {};
        headerRow.forEach((val, idx) => {
            if (val) colMap[val] = idx;
        });

        // Find row by S.No (leadId)
        let targetRow = null;
        const snoCol = colMap['S.No'];
        if (snoCol) {
            worksheet.eachRow((row) => {
                if (row.getCell(snoCol).value == leadId) {
                    targetRow = row;
                }
            });
        }

        if (!targetRow) {
            return res.status(404).send('Lead not found.');
        }

        // Update columns
        for (const [colName, value] of Object.entries(updateData)) {
            const colIdx = colMap[colName];
            if (colIdx) {
                targetRow.getCell(colIdx).value = value;
            }
        }

        await workbook.xlsx.writeFile(filePath);
        res.send({ status: 'updated' });
    } catch (err) {
        console.error('Error updating lead:', err);
        res.status(500).send('Error updating lead data: ' + err.message);
    }
});

// Crash recovery: if the server died mid-campaign (kill, crash, PC reboot) the
// pending queue was snapshotted after every pop. Restore it here so the run
// carries on from the next pending city without anyone pressing Start.
// A campaign stopped through /stop has already deleted the snapshot.
(async () => {
    const saved = loadCampaignState();
    if (!saved || !Array.isArray(saved.queue) || saved.queue.length === 0) return;
    if (scraperProcess || isProcessingQueue) return;

    // The output file may have been moved or deleted while the server was down.
    // Losing it is not fatal, but the resume must not pretend it can append to it.
    if (saved.outputFile && !fs.existsSync(saved.outputFile)) {
        console.log(`⚠ Resumed campaign's output file is missing: ${saved.outputFile}`);
        saved.outputFile = null;
    }

    queryQueue = saved.queue.map((j) => ({
        query: j.query, category: j.category, state: j.state,
        city: j.city, trackerKey: j.trackerKey,
    }));
    // A job that was mid-scrape when the server died is in neither the queue nor
    // the progress file. Put it back at the head so the city is not skipped.
    if (saved.inFlight && !queryQueue.some((j) => j.query === saved.inFlight.query)) {
        queryQueue.unshift(saved.inFlight);
    }
    campaignChain = saved.chain || null;
    campaignCountry = saved.country || 'USA';
    sessionOutputFile = saved.outputFile || null;
    globalCampaignDelay = saved.delay || 10000;
    globalSessionLimit = saved.limit || 0;
    globalSessionProxy = saved.proxy || '';
    // Nothing to restore: the synced-email set is rebuilt from the sheet by the
    // sync itself, which is the authority on what is already there.
    if (Array.isArray(saved.syncedEmails) && sessionOutputFile) {
        gsyncedEmails[sessionOutputFile] = new Set(saved.syncedEmails);
    }
    campaignStats = saved.stats || { total: 0, succeeded: 0, failed: 0, failedNames: [] };
    isProcessingQueue = true;

    const fromCat = saved.chain ? saved.chain.categories[saved.chain.currentIndex] : '?';
    console.log(`▶ Resuming interrupted campaign: ${queryQueue.length} quer${queryQueue.length === 1 ? 'y' : 'ies'} remaining in [${fromCat}].`);
    io.emit('log', `\n▶ Server restarted with a campaign in progress — resuming [${fromCat}] at ${queryQueue.length} remaining quer${queryQueue.length === 1 ? 'y' : 'ies'}.`);

    processNextInQueue();
})();

server.listen(PORT, () => {
    console.log(`🚀 UI Server running at http://localhost:${PORT}`);
    try { require('./email-imap-poller.js').startPoller(); } catch(_) {}
});
