/**
 * Email marketing tool — sends a campaign to the scraped leads.
 *
 * Reads the leads from the local Excel files (or the Google Sheet), filters to
 * a clean, deliverable list, and sends via an SMTP relay.
 *
 * IMPORTANT - deliverability:
 *   Sending directly from a residential IP on port 25 will get the IP
 *   blacklisted within minutes. Configure an SMTP relay (Mailgun, SendGrid,
 *   Amazon SES, Postmark) instead. The relay also provides the bounce and
 *   suppression handling that protects your sender reputation.
 *
 * Compliance (CAN-SPAM, US recipients):
 *   - Every email includes a working unsubscribe link.
 *   - Every email includes a physical postal address in the body.
 *   - Unsubscribes are recorded immediately and never re-sent.
 *   - Hard bounces are suppressed automatically.
 *
 * Usage:
 *   node email-marketing.js --list                 # preview the sendable list
 *   node email-marketing.js --dry-run              # render, don't send
 *   node email-marketing.js --send                 # actually send
 *   node email-marketing.js --send --limit 50     # throttle a first test
 *
 * Config lives in email-config.json (created from the template on first run).
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, 'email-config.json');
const SUPPRESSION_PATH = path.join(__dirname, 'email-suppression.json');
const SENT_LOG_PATH = path.join(__dirname, 'email-sent-log.json');

// ---------------------------------------------------------------------------

/**
 * Emails that are never deliverable: role accounts a human did not opt into,
 * obvious placeholders, and domains that only produce bounces. Reused from the
 * existing email-finder.js blacklist so the two tools agree.
 */
/**
 * Local parts that will never reach a human: automated senders and obvious
 * template placeholders scraped off a page. Deliberately SHORT - role accounts
 * like info@/contact@/events@ are kept, because for B2B outreach to a
 * restaurant or plumber those are the addresses a person genuinely reads. This
 * matches the ROLE_PRIORITY convention already used by email-finder.js.
 */
const HARD_BLOCK_LOCAL = new Set([
    'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'do-not-reply',
    'postmaster', 'webmaster', 'abuse', 'spam', 'security@', 'maildaemon',
    // Placeholders left in a site's template. 'your@email.com' really does
    // appear in scraped rows when a business never filled in its contact field.
    'test', 'user', 'name', 'yourname', 'your', 'email', 'example',
    'foo', 'bar', 'sample', 'demo', 'xxx', 'yyy', 'abc', 'qwerty',
]);

const PLACEHOLDER_RE = /^(your|my|enter|insert|type|replace)[_.-]?(email|mail|address|name)?/i;

const SYNTAX_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

// Domains that only produce bounces or complaints. Consumer webmail is here
// because a scraped gmail.com address is almost always the owner's personal
// account, not a business inquiry channel - and cold-marketing those is what
// generates the spam complaints that wreck sender reputation.
const BAD_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'msn.com', 'live.com', 'protonmail.com', 'yandex.com',
    'mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com',
    'email.com', 'example.com', 'domain.com', 'yourdomain.com', 'test.com',
]);

// Role accounts are deliverable but impersonal. Reported separately rather than
// dropped, so you can decide per-campaign whether to include them.
const ROLE_LOCAL = new Set([
    'info', 'contact', 'contactus', 'sales', 'hello', 'enquiries', 'enquiry',
    'admin', 'office', 'support', 'mail', 'reception', 'service', 'billing',
    'events', 'orders', 'feedback', 'pr', 'partnerships', 'marketing',
    'reservations', 'booking', 'jobs', 'hr', 'accounts', 'manager',
]);

// ---------------------------------------------------------------------------
// Config

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.log('No email-config.json found. Creating one from the template...');
        console.log('Fill in the SMTP relay credentials and BUSINESS_ADDRESS, then re-run.\n');
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
        console.log(`Written to ${CONFIG_PATH}`);
        process.exit(0);
    }
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const missing = [];
    if (!cfg.smtp?.host) missing.push('smtp.host');
    if (!cfg.smtp?.user) missing.push('smtp.user');
    if (!cfg.smtp?.pass) missing.push('smtp.pass');
    if (!cfg.from?.address) missing.push('from.address');
    if (!cfg.business_address) missing.push('business_address');
    if (!cfg.unsubscribe_base_url) missing.push('unsubscribe_base_url');
    if (missing.length) {
        console.error('email-config.json is missing required fields:');
        for (const m of missing) console.error(`  - ${m}`);
        console.error('\nEdit email-config.json and try again.');
        process.exit(1);
    }
    return cfg;
}

const DEFAULT_CONFIG = {
    smtp: {
        host: 'smtp.mailgun.org',
        port: 587,
        user: 'REPLACE_ME',
        pass: 'REPLACE_ME',
    },
    from: { name: 'Your Name', address: 'you@yourdomain.com' },
    reply_to: 'you@yourdomain.com',
    // A URL this tool can serve unsubscribe confirmations from. If your PC is
    // not publicly reachable, leave the relay's hosted page here instead.
    unsubscribe_base_url: 'http://localhost:3000',
    // CAN-SPAM requires a physical postal address in every commercial email.
    business_address: 'Your Business, 123 Main St, City, ST 12345',
    subject: 'Quick question about {{category}} work in {{area}}',
    per_hour: 200,
    per_batch: 50,
    batch_pause_seconds: 30,
};

// ---------------------------------------------------------------------------
// Suppression list — unsubscribes, bounces, and manual exclusions.

function loadSuppression() {
    if (!fs.existsSync(SUPPRESSION_PATH)) return { unsubscribed: {}, bounced: {}, manual: [] };
    try {
        return JSON.parse(fs.readFileSync(SUPPRESSION_PATH, 'utf8'));
    } catch (err) {
        console.error(`email-suppression.json is unreadable: ${err.message}`);
        process.exit(1);
    }
}

function saveSuppression(sup) {
    fs.writeFileSync(SUPPRESSION_PATH, JSON.stringify(sup, null, 2));
}

function isSuppressed(sup, email) {
    const e = email.trim().toLowerCase();
    return !!(sup.unsubscribed[e] || sup.bounced[e] || (sup.manual || []).includes(e));
}

/**
 * Records a suppression. `reason` is one of unsubscribe / bounce / manual so the
 * origin is auditable later - a bounce list and an opt-out list are legally
 * different things and must not be merged into one opaque set.
 */
function suppress(sup, email, reason, detail = '') {
    const e = email.trim().toLowerCase();
    const stamp = new Date().toISOString();
    if (reason === 'bounce') sup.bounced[e] = { at: stamp, detail };
    else if (reason === 'manual') { if (!sup.manual.includes(e)) sup.manual.push(e); }
    else sup.unsubscribed[e] = { at: stamp, detail };
    saveSuppression(sup);
}

// ---------------------------------------------------------------------------
// Send log — which emails have already gone out, so a re-run is a no-op.

function loadSentLog() {
    if (!fs.existsSync(SENT_LOG_PATH)) return {};
    try { return JSON.parse(fs.readFileSync(SENT_LOG_PATH, 'utf8')); }
    catch (err) { return {}; }
}

function recordSent(log, email, campaign, lead) {
    log[email.trim().toLowerCase()] = {
        campaign,
        at: new Date().toISOString(),
        name: lead.name,
        area: lead.area,
    };
    fs.writeFileSync(SENT_LOG_PATH, JSON.stringify(log, null, 2));
}

// ---------------------------------------------------------------------------
// Lead loading and cleaning

/**
 * Reads every .xlsx in output/ and returns one lead per unique, non-empty
 * email. Duplicates collapse to the first occurrence - the same business often
 * appears in several city files.
 */
async function loadLeadsFromFile(file) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    const header = ws.getRow(1).values;

    // Resolve column indexes by header name, so column order can drift.
    const idx = {};
    header.forEach((h, i) => {
        if (!h) return;
        const k = String(h).trim().toLowerCase();
        if (k === 'name') idx.name = i;
        if (k === 'email') idx.email = i;
        if (k === 'category') idx.category = i;
        if (k === 'area' || k === 'scrapedfrom') { if (idx.area == null) idx.area = i; }
        if (k === 'website') idx.website = i;
        if (k === 'phone 1' || k === 'phone1') idx.phone = i;
    });

    const leads = [];
    ws.eachRow((row, n) => {
        if (n === 1) return;
        const val = (i) => {
            const v = row.values[i];
            if (v == null) return '';
            return typeof v === 'object' ? String(v.text || v.result || '') : String(v).trim();
        };
        leads.push({
            name: val(idx.name), email: val(idx.email),
            category: val(idx.category), area: val(idx.area),
            website: val(idx.website), phone: val(idx.phone),
            source: path.basename(file),
        });
    });
    return leads;
}

async function loadAllLeads(files) {
    const all = [];
    for (const f of files) {
        try { all.push(...(await loadLeadsFromFile(f))); }
        catch (err) { console.error(`  skipped ${path.basename(f)}: ${err.message}`); }
    }
    return all;
}

/**
 * The cleaning pipeline. Each stage reports its own count so the preview shows
 * exactly where the list shrinks - a flat "sent N" hides a bad scrape or a
 * mis-set filter.
 */
function cleanLeads(leads, sup, sentLog, opts = {}) {
    const stages = [];
    const pass1 = leads.filter((l) => l.email && l.email.includes('@'));
    stages.push(['with an email at all', pass1.length]);

    const seen = new Set();
    const pass2 = [];
    for (const l of pass1) {
        const e = l.email.trim().toLowerCase();
        if (seen.has(e)) continue;
        seen.add(e);
        pass2.push({ ...l, email: e });
    }
    stages.push(['unique emails', pass2.length]);

    const pass3 = pass2.filter((l) => {
        if (!SYNTAX_RE.test(l.email)) return false;
        const [local, domain] = l.email.split('@');
        if (HARD_BLOCK_LOCAL.has(local)) return false;
        if (PLACEHOLDER_RE.test(l.email)) return false;
        if (BAD_DOMAINS.has(domain)) return false;
        return true;
    });
    stages.push(['syntax + not placeholder/free domain', pass3.length]);

    // Split role accounts out so they are a visible choice, not a silent drop.
    const pass3b = pass3.filter((l) => !ROLE_LOCAL.has(l.email.split('@')[0]));
    stages.push(['  (of which direct/personal address', pass3b.length + ')']);
    stages.push(['  (of which role address, kept)', pass3.length - pass3b.length]);

    const pass4 = pass3.filter((l) => !isSuppressed(sup, l.email));
    stages.push(['not already unsubscribed/bounced', pass4.length]);

    const campaign = opts.campaign || 'default';
    // Exclude anything already sent in this campaign unless the caller
    // explicitly asked for a resend.
    const pass5 = opts.resend ? pass4 : pass4.filter((l) => sentLog[l.email]?.campaign !== campaign);
    stages.push([`not already sent in campaign "${campaign}"`, pass5.length]);

    return { leads: pass5, stages };
}

// ---------------------------------------------------------------------------
// Message rendering

// Greeting logic lives in email-marketing-helpers.js so it can be unit tested
// against real scraped business names without standing up a campaign.
const { greetingFor, BUSINESS_MARK } = require('./email-marketing-helpers.js');

function fillTemplate(tpl, lead, cfg = {}) {
    return tpl
        .replace(/\{\{sender_name\}\}/gi, cfg.sender_name || cfg.from?.name || 'Komal')
        .replace(/\{\{greeting\}\}/gi, greetingFor(lead))
        .replace(/\{\{name\}\}/gi, lead.name || 'there')
        .replace(/\{\{first_name\}\}/gi, (lead.name || 'there').split(/\s+/)[0])
        .replace(/\{\{category\}\}/gi, lead.category || 'your')
        .replace(/\{\{area\}\}/gi, lead.area || 'your area')
        .replace(/\{\{website\}\}/gi, lead.website || '');
}

function unsubLink(cfg, email) {
    // HMAC'd so the link cannot be forged to unsubscribe someone else. The
    // secret is per-config; change it and prior links become invalid, which is
    // the intended behaviour for a credential rotation.
    const secret = cfg.unsubscribe_secret || cfg.smtp.pass || 'unsub-secret';
    const token = crypto.createHmac('sha256', secret).update(email).digest('hex');
    const b = Buffer.from(email).toString('base64url');
    return `${cfg.unsubscribe_base_url.replace(/\/$/, '')}/unsubscribe?e=${b}&t=${token}`;
}

function buildMessage(cfg, lead, campaign) {
    const subject = fillTemplate(cfg.subject, lead, cfg);
    const plain = fillTemplate(cfg.body || DEFAULT_BODY, lead, cfg);
    const html = fillTemplate(cfg.body_html || DEFAULT_HTML, lead, cfg)
        .replace('{{unsubscribe_url}}', unsubLink(cfg, lead.email))
        .replace('{{business_address}}', cfg.business_address);
    return {
        to: lead.email,
        from: `${cfg.from.name} <${cfg.from.address}>`,
        replyTo: cfg.reply_to || cfg.from.address,
        subject,
        text: plain + `\n\n${cfg.business_address}\n\nUnsubscribe: ${unsubLink(cfg, lead.email)}`,
        html,
        // Tagged so the relay's bounce webhook can attribute a failure back to
        // this campaign without parsing the body.
        headers: { 'X-Campaign': campaign },
    };
}

const DEFAULT_BODY = `{{greeting}},

I came across {{name}} while looking at {{category}} businesses in {{area}} and wanted to reach out directly.

I help local service businesses get more consistent work from Google Maps - the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.

Worth a 10 minute call this week?

Best,
{{sender_name}}

{{business_address}}

You are receiving this because we found {{name}} listed publicly. If you would rather not hear from us, reply with "stop" or unsubscribe here: {{unsubscribe_url}}`;

const DEFAULT_HTML = `<div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;">
<p>{{greeting}},</p>
<p>I came across <strong>{{name}}</strong> while looking at {{category}} businesses in {{area}} and wanted to reach out directly.</p>
<p>I help local service businesses get more consistent work from Google Maps &mdash; the same place you were found. If that is a problem you are trying to solve, I would be glad to show you a couple of specific things that would move the needle for {{name}}.</p>
<p>Worth a 10 minute call this week?</p>
<p>Best,<br>{{sender_name}}</p>
<p style="font-size: 12px; color: #666; margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px;">
  {{business_address}}<br>
  You are receiving this because {{name}} is listed publicly. <a href="{{unsubscribe_url}}">Unsubscribe</a>.
</p>
</div>`;

// ---------------------------------------------------------------------------
// Sending

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Sends via nodemailer if it is installed, otherwise falls back to a raw SMTP
 * submission over TLS. The fallback exists so the tool works without an extra
 * dependency, but nodemailer is strongly preferred - it handles auth, 8BITMIME
 * and connection reuse correctly.
 */
async function createTransport(cfg) {
    try {
        const nodemailer = require('nodemailer');
        return { kind: 'nodemailer', t: nodemailer.createTransport({
            host: cfg.smtp.host, port: cfg.smtp.port,
            secure: cfg.smtp.port === 465,
            auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
        }) };
    } catch (err) {
        console.log('  (nodemailer not installed - using the built-in SMTP client)');
        return { kind: 'raw', cfg };
    }
}

async function sendOne(transport, msg) {
    if (transport.kind === 'nodemailer') {
        const info = await transport.t.sendMail(msg);
        return { ok: true, id: info.messageId || info.response };
    }
    // Raw SMTP submission - minimal but sufficient for a relay on 587/465.
    return sendRawSmtp(transport.cfg, msg);
}

function sendRawSmtp(cfg, msg) {
    return new Promise((resolve, reject) => {
        const tls = require('tls');
        const net = require('net');
        const host = cfg.smtp.host, port = cfg.smtp.port;

        let buf = '';
        let step = 0;
        let sock;

        const say = (s) => sock.write(s + '\r\n');

        const onData = (data) => {
            buf += data.toString();
            const lines = buf.split('\r\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                if (!/^\d{3}[ -]/.test(line)) continue;
                const code = parseInt(line.slice(0, 3), 10);
                if (step === 0 && code === 220) { say(`EHLO ${cfg.from.address.split('@')[1]}`); step = 1; }
                else if (step === 1 && code === 250) { say('STARTTLS'); step = 2; }
                else if (step === 2 && code === 220) {
                    sock = tls.connect({ socket: sock, servername: host }, () => {
                        say(`EHLO ${cfg.from.address.split('@')[1]}`); step = 3;
                    });
                    sock.on('data', onData);
                    sock.on('error', reject);
                    return;
                }
                else if (step === 3 && code === 250) {
                    const tok = Buffer.from(`\0${cfg.smtp.user}\0${cfg.smtp.pass}`).toString('base64');
                    say('AUTH PLAIN ' + tok); step = 4;
                }
                else if (step === 4 && code === 235) { say(`MAIL FROM:<${msg.from.match(/<([^>]+)>/)[1]}>`); step = 5; }
                else if (step === 5 && code === 250) { say(`RCPT TO:<${msg.to}>`); step = 6; }
                else if (step === 6 && code === 250) { say('DATA'); step = 7; }
                else if (step === 7 && code === 354) {
                    say(`From: ${msg.from}\r\nTo: ${msg.to}\r\nSubject: ${msg.subject}\r\nContent-Type: text/plain; charset="utf-8"\r\n\r\n${msg.text}\r\n.`);
                    step = 8;
                }
                else if (step === 8 && code === 250) { say('QUIT'); resolve({ ok: true, id: line }); sock.end(); return; }
                else if (code >= 400 && code < 600) {
                    // Permanent SMTP failure - the relay refused this recipient.
                    sock.end();
                    const e = new Error(`SMTP ${code}: ${line}`);
                    e.smtpCode = code; e.permanent = code >= 500;
                    reject(e); return;
                }
            }
        };

        sock = net.connect(port, host, () => {});
        sock.on('data', onData);
        sock.on('error', reject);
        sock.setTimeout(30000, () => { sock.destroy(); reject(new Error('SMTP timeout')); });
    });
}

// ---------------------------------------------------------------------------
// Main

(async () => {
    const args = process.argv.slice(2);
    const mode = args.includes('--send') ? 'send' : args.includes('--dry-run') ? 'dry-run' : 'list';

    const cfg = loadConfig();
    const sup = loadSuppression();
    const sentLog = loadSentLog();
    const campaign = cfg.campaign_name || (new Date().toISOString().slice(0, 10));

    // Source: explicit files, else everything in output/.
    const outDir = path.join(__dirname, 'output');
    let files = args.filter((a) => a.endsWith('.xlsx')).map((a) => path.isAbsolute(a) ? a : path.join(outDir, a));
    if (files.length === 0) files = fs.readdirSync(outDir).filter((f) => f.endsWith('.xlsx'))
        .map((f) => path.join(outDir, f));

    if (files.length === 0) { console.error('No .xlsx files found in output/'); process.exit(1); }

    console.log(`Loading ${files.length} workbook(s)...`);
    const raw = await loadAllLeads(files);
    console.log(`  ${raw.length} total rows\n`);

    const { leads, stages } = cleanLeads(raw, sup, sentLog, { campaign });
    for (const [label, n] of stages) console.log(`  ${String(n).padStart(6)}  ${label}`);
    console.log(`\n  => ${leads.length} sendable for campaign "${campaign}"\n`);

    if (leads.length === 0) { console.log('Nothing to send.'); process.exit(0); }

    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;
    const sendable = limit > 0 ? leads.slice(0, limit) : leads;
    if (limit > 0) console.log(`Throttled to first ${sendable.length} (--limit ${limit})\n`);

    if (mode === 'list') {
        console.log('Preview (first 15):');
        for (const l of sendable.slice(0, 15)) {
            console.log(`  ${l.email.padEnd(38)} ${String(l.name).slice(0, 32).padEnd(34)} ${l.area || ''}`);
        }
        console.log(`\nRe-run with --dry-run to see the rendered email, or --send to send.`);
        return;
    }

    const transport = await createTransport(cfg);
    console.log(`Transport: ${transport.kind} via ${cfg.smtp.host}:${cfg.smtp.port}\n`);

    let sent = 0, failed = 0;
    const perBatch = cfg.per_batch || 50;
    const pause = (cfg.batch_pause_seconds || 30) * 1000;

    for (let i = 0; i < sendable.length; i++) {
        const lead = sendable[i];
        const msg = buildMessage(cfg, lead, campaign);

        if (mode === 'dry-run') {
            console.log(`--- ${lead.email} (${lead.name}) ---`);
            console.log(`Subject: ${msg.subject}\n${msg.text.split('\n').slice(0, 4).join('\n')}...\n`);
            continue;
        }

        try {
            const res = await sendOne(transport, msg);
            sent++;
            recordSent(sentLog, lead.email, campaign, lead);
            if (sent % 10 === 0) console.log(`  sent ${sent}/${sendable.length}`);
        } catch (err) {
            failed++;
            console.error(`  FAILED ${lead.email}: ${err.message}`);
            // A permanent SMTP refusal (unknown mailbox, domain does not exist)
            // means this address will never accept mail. Suppress it so it can
            // never hurt sender reputation again.
            if (err.permanent || /unknown|does not exist|invalid|no such/i.test(err.message)) {
                suppress(sup, lead.email, 'bounce', err.message);
                console.log(`    -> suppressed (permanent bounce)`);
            }
        }
        if (mode === 'send' && (i + 1) % perBatch === 0 && i + 1 < sendable.length) {
            console.log(`  pausing ${pause / 1000}s between batches...`);
            await sleep(pause);
        }
    }

    if (mode === 'dry-run') {
        console.log(`\nDry run complete: ${sendable.length} would be sent. Re-run with --send to deliver.`);
        return;
    }
    console.log(`\nDone. sent=${sent} failed=${failed} (of ${sendable.length})`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
