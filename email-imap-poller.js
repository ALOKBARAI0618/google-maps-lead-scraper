/**
 * email-imap-poller.js — IMAP polling for replies + async bounces.
 * Shared by both servers. Only one process polls at a time (file lock).
 */
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'email-imap-state.json');
const LOCK_FILE = path.join(__dirname, '.email-imap.lock');

let timer = null;
let pollInProgress = false;

function loadImapConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'email-config.json'), 'utf8'));
    const imap = cfg.imap || {};
    // Reuse SMTP creds if imap creds not set
    const host = imap.host || cfg.smtp?.host || 'mail.cotechagency.com';
    const port = imap.port || 993;
    const secure = imap.secure !== false;
    const user = imap.user || cfg.smtp?.user || '';
    const pass = imap.pass || cfg.smtp?.pass || '';
    const mailbox = imap.mailbox || 'INBOX';
    const pollSeconds = imap.poll_seconds || imap.pollSeconds || 180;
    if (!user || !pass) return null;
    return { host, port, secure, user, pass, mailbox, pollSeconds };
  } catch (_) { return null; }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) { return { lastPollAt: null, lastUid: 0, lastError: null, checked: 0, matched: 0 }; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch (_) {}
}

function tryLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, 'utf8');
      const lock = JSON.parse(raw);
      // 10 min expiry
      if (Date.now() - new Date(lock.at).getTime() < 10 * 60 * 1000) return false;
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    return true;
  } catch (_) { return false; }
}
function unlock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

async function pollOnce() {
  if (pollInProgress) return { checked: 0, matched: 0, skipped: true };
  pollInProgress = true;
  const cfg = loadImapConfig();
  if (!cfg) { pollInProgress = false; return { checked: 0, matched: 0, error: 'no imap config' }; }
  const haveLock = tryLock();
  if (!haveLock) { pollInProgress = false; return { checked: 0, matched: 0, skipped: true, reason: 'locked' }; }

  let checked = 0, matched = 0, lastError = null;
  let client = null;
  try {
    const { ImapFlow } = require('imapflow');
    const { simpleParser } = require('mailparser');
    const { loadEvents, recordReply, recordBounce } = require('./email-events.js');
    const events = loadEvents();
    const sentLog = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'email-sent-log.json'), 'utf8')); } catch (_) { return {}; } })();
    // Build lookup: lowerEmail -> true for sent recipients
    const sentSet = new Set();
    for (const k of Object.keys(events)) sentSet.add(k.toLowerCase());
    for (const k of Object.keys(sentLog)) sentSet.add(String(k).toLowerCase());

    client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
      tls: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.mailboxOpen(cfg.mailbox);

    const state = loadState();
    // Search unseen + recent; fallback to last 7 days on first run
    let searchQuery = { seen: false };
    // If we have a lastPollAt, search since that date as well
    // imapflow search supports { since: Date }
    if (!state.lastPollAt) {
      // First run: last 7 days
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      searchQuery = { since };
    }

    const uids = await client.search(searchQuery, { uid: true });
    const toFetch = uids || [];
    checked = toFetch.length;

    // Limit per poll
    const batch = toFetch.slice(0, 200);
    for (const uid of batch) {
      try {
        const msg = await client.fetchOne(uid, { uid: true, envelope: true, source: true, bodyStructure: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const fromAddr = (parsed.from?.value?.[0]?.address || parsed.from?.text || '').toLowerCase().trim();
        const subject = parsed.subject || '';
        const snippet = (parsed.text || '').slice(0, 200).replace(/\s+/g, ' ').trim();
        const messageId = parsed.messageId || '';
        const inReplyTo = parsed.inReplyTo || '';
        const references = parsed.references || '';

        // Bounce detection: from mailer-daemon and body contains a tracked recipient
        const isBounceFrom = /mailer-daemon|mail delivery|postmaster/i.test(fromAddr) || /Delivery Status Notification/i.test(subject);
        if (isBounceFrom) {
          const bodyText = (parsed.text || '') + ' ' + (parsed.html || '');
          for (const email of sentSet) {
            if (bodyText.toLowerCase().includes(email)) {
              recordBounce(email, { reason: 'async bounce: ' + subject.slice(0, 200) });
              matched++;
              break;
            }
          }
          continue;
        }

        // Reply detection: from is a tracked recipient
        if (fromAddr && sentSet.has(fromAddr)) {
          // Check threading or Re: subject
          const isReply = !!inReplyTo || !!references || /^re:/i.test(subject) || sentSet.has(fromAddr);
          if (isReply) {
            recordReply(fromAddr, { subject, from: fromAddr, at: (parsed.date || new Date()).toISOString(), snippet });
            matched++;
          }
          continue;
        }

        // Fallback: extract any email from body that matches sentSet (forwarded reply)
        // lightweight: check if any sent email appears in body
        if (parsed.text) {
          const lowerBody = parsed.text.toLowerCase();
          for (const email of sentSet) {
            if (lowerBody.includes(email) && /^re:/i.test(subject)) {
              recordReply(email, { subject, from: fromAddr || email, at: (parsed.date || new Date()).toISOString(), snippet });
              matched++;
              break;
            }
          }
        }
      } catch (_) { /* per-message fail, continue */ }
    }

    await client.logout();
    client = null;
  } catch (e) {
    lastError = String(e.message || e).slice(0, 400);
    try { if (client) await client.logout(); } catch (_) {}
  } finally {
    unlock();
    const s = loadState();
    s.lastPollAt = new Date().toISOString();
    s.checked = checked;
    s.matched = matched;
    s.lastError = lastError;
    saveState(s);
    pollInProgress = false;
  }
  return { checked, matched, error: lastError || undefined };
}

function startPoller() {
  const cfg = loadImapConfig();
  if (!cfg) return null;
  if (timer) return timer;
  // Immediate poll after 10s, then interval
  setTimeout(() => { pollOnce().catch(() => {}); }, 10000);
  timer = setInterval(() => { pollOnce().catch(() => {}); }, (cfg.pollSeconds || 180) * 1000);
  // Don't keep process alive just for polling
  if (timer.unref) timer.unref();
  return timer;
}
function stopPoller() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { loadImapConfig, pollOnce, startPoller, stopPoller, STATE_FILE };
