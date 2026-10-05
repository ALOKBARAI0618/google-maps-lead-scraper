/**
 * email-core.js — shared cleaning + template + sheet-status logic.
 * Used by both the main scraper server and the standalone email-tool server
 * so the hand-off build cannot drift from the scraper build.
 */
const fs = require('fs');
const path = require('path');

const HARD_BLOCK_LOCAL = new Set(['noreply','no-reply','donotreply','do-not-reply','postmaster','webmaster','abuse','spam','security@','maildaemon','test','user','name','yourname','your','email','example','foo','bar','sample','demo','xxx','yyy','abc','qwerty']);
const PLACEHOLDER_RE = /^(your|my|enter|insert|type|replace)[_.-]?(email|mail|address|name)?/i;
const SYNTAX_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const BAD_DOMAINS = new Set(['gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com','msn.com','live.com','protonmail.com','yandex.com','mailinator.com','guerrillamail.com','tempmail.com','10minutemail.com','email.com','example.com','domain.com','yourdomain.com','test.com']);
const ROLE_LOCAL = new Set(['info','contact','contactus','sales','hello','enquiries','enquiry','admin','office','support','mail','reception','service','billing','events','orders','feedback','pr','partnerships','marketing','reservations','booking','jobs','hr','accounts','manager']);

function isSuppressed(sup, email) {
  const e = String(email||'').trim().toLowerCase();
  return !!(sup.unsubscribed[e] || sup.bounced[e] || (sup.manual||[]).includes(e));
}

function cleanLeads(leads, sup, sentLog, opts={}) {
  const campaign = opts.campaign || 'default';
  const resend = !!opts.resend;
  const pass1 = leads.filter(l=> l.email && String(l.email).includes('@'));
  const seen=new Set(); const pass2=[];
  for(const l of pass1){ const e=String(l.email).trim().toLowerCase(); if(seen.has(e)) continue; seen.add(e); pass2.push({...l, email:e}); }
  const pass3 = pass2.filter(l=>{
    if(!SYNTAX_RE.test(l.email)) return false;
    const [local,domain]=l.email.split('@');
    if(HARD_BLOCK_LOCAL.has(local)) return false;
    if(PLACEHOLDER_RE.test(l.email)) return false;
    if(BAD_DOMAINS.has(domain)) return false;
    return true;
  });
  const direct = pass3.filter(l=> !ROLE_LOCAL.has(l.email.split('@')[0]));
  // sheetStatuses: Map lowerEmail -> status string (from Google Sheet column G).
  // DELIVERED means already mailed in the sheet; everything else (empty, UNDELIVERED, FAILED, etc.) is still mailable.
  const sheetStatuses = opts.sheetStatuses || null;
  const isDeliveredInSheet = (email)=>{
    if(!sheetStatuses) return false;
    const s = String(sheetStatuses.get(String(email).trim().toLowerCase())||'').trim().toLowerCase();
    return s === 'delivered';
  };
  let deliveredInSheet = 0;
  let suppressedOnly = 0;
  if (sheetStatuses) {
    for (const l of pass3) if (isDeliveredInSheet(l.email)) deliveredInSheet++;
  }
  for (const l of pass3) if (isSuppressed(sup, l.email)) suppressedOnly++;
  const notSup = pass3.filter(l=> !isSuppressed(sup,l.email) && !isDeliveredInSheet(l.email));
  const sendable = resend ? notSup : notSup.filter(l=> !(sentLog[l.email] && sentLog[l.email].campaign===campaign));
  const totalExcluded = pass3.length - notSup.length;
  return { pass1, pass2, pass3, directCount: direct.length, roleCount: pass3.length - direct.length, notSup, sendable, deliveredInSheet, suppressedOnly, totalExcluded };
}

function loadTemplates() {
  try {
    const p = path.join(__dirname,'email-templates.json');
    return JSON.parse(fs.readFileSync(p,'utf8'));
  } catch(_) { return { templates:{} }; }
}

function templateForCategory(category, templatesFile) {
  const t = (templatesFile && templatesFile.templates) || {};
  if (category && t[category]) return t[category];
  if (category) {
    const k = Object.keys(t).find(x=> x.toLowerCase()===String(category).toLowerCase());
    if(k) return t[k];
  }
  return t['Restaurants'] || t[Object.keys(t)[0]] || null;
}

module.exports = { HARD_BLOCK_LOCAL, PLACEHOLDER_RE, SYNTAX_RE, BAD_DOMAINS, ROLE_LOCAL, isSuppressed, cleanLeads, loadTemplates, templateForCategory };
