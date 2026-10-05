/**
 * Standalone Email Campaign Tool — no scraper dependency.
 * Run:  node email-campaign-tool/server.js
 * Env:  GSHEET_SPREADSHEET_ID, GSHEET_KEY_FILE / GSHEET_KEY_JSON, EMAIL_TOOL_PORT (default 3003)
 *
 * Shares email-core.js + email-templates.json + email-sheet.js with the main app
 * so per-category templates and sheet-status filtering stay in sync.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.EMAIL_TOOL_PORT || '3003', 10);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// also serve logos from main public so /cotech-logo-*.png resolves
app.use(express.static(path.join(ROOT, 'public')));

const { cleanLeads, loadTemplates, templateForCategory } = require(path.join(ROOT, 'email-core.js'));
const { readSheetStatuses, writeStatuses } = require(path.join(ROOT, 'email-sheet.js'));
const helpers = require(path.join(ROOT, 'email-marketing-helpers.js'));
// Pixel + events (shared with main server)
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
function sendPixel(res){
  res.setHeader('Content-Type','image/gif');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  res.setHeader('Content-Length', String(PIXEL_GIF.length));
  res.end(PIXEL_GIF);
}

function loadConfig() {
  const p = path.join(ROOT, 'email-config.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function loadSuppression() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'email-suppression.json'), 'utf8')); } catch(_) { return { unsubscribed:{}, bounced:{}, manual:[] }; }
}
function loadSentLog() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'email-sent-log.json'), 'utf8')); } catch(_) { return {}; }
}
function sanitizeCampaignName(raw){ let v=String(raw||"").trim().slice(0,80); v=v.split("/").join("-").split("\\").join("-"); v=v.replace(/[\n\r\t]+/g,"-"); v=v.replace(/\s+/g," ").trim(); if(!v) return new Date().toISOString().slice(0,10); v=v.replace(/[^\w\s\-\.\(\)]/g,"").replace(/\s+/g," ").trim(); return v.slice(0,60) || new Date().toISOString().slice(0,10); }
function campaignName(cfg) { const c=String(cfg.campaign_name||'').trim(); return c ? sanitizeCampaignName(c) : new Date().toISOString().slice(0,10); }

function fillTpl(tpl, lead, cfg) {
  return String(tpl||'')
    .replace(/\{\{sender_name\}\}/gi, cfg.sender_name||cfg.from?.name||'')
    .replace(/\{\{greeting\}\}/gi, helpers.greetingFor(lead))
    .replace(/\{\{name\}\}/gi, lead.name||'there')
    .replace(/\{\{first_name\}\}/gi, (lead.name||'there').split(/\s+/)[0])
    .replace(/\{\{category\}\}/gi, lead.category||'your')
    .replace(/\{\{area\}\}/gi, lead.area||'your area')
    .replace(/\{\{website\}\}/gi, lead.website||'');
}
function unsubLink(cfg, email) {
  const secret = cfg.unsubscribe_secret || cfg.smtp.pass || 'unsub-secret';
  const token = crypto.createHmac('sha256', secret).update(email).digest('hex');
  const b = Buffer.from(email).toString('base64url');
  const base = String(cfg.unsubscribe_base_url||'').replace(/\/$/,'');
  return `${base}/unsubscribe?e=${b}&t=${token}`;
}
function resolveTemplate(cfg, leadCategory, templatesFile) {
  // Per-category templates take precedence; fall back to cfg.body/body_html/subject
  const catTpl = templateForCategory(leadCategory, templatesFile);
  const subject = (catTpl && catTpl.subject) || cfg.subject || 'Quick question about {{category}} work in {{area}}';
  const body = (catTpl && catTpl.body) || cfg.body || "{{greeting}},\n\nI came across {{name}} while looking at {{category}} businesses in {{area}} and wanted to reach out directly.\n\nI help local {{category}} businesses get more consistent work from Google Maps — the same place you were found. If getting more steady jobs from Maps is on your radar, I can show you 2–3 specific fixes for {{name}} that move the needle.\n\nWorth a 10-minute call this week?\n\nBest,\n{{sender_name}}\n\n{{business_address}}\n\nYou are receiving this because {{name}} is listed publicly. If you would rather not hear from us, reply with \"stop\" or unsubscribe here: {{unsubscribe_url}}";
  const body_html = (catTpl && catTpl.body_html) || cfg.body_html || '<div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;"><p>{{greeting}},</p><p>I came across <strong>{{name}}</strong> while looking at {{category}} businesses in {{area}} and wanted to reach out directly.</p><p>I help local {{category}} businesses get more consistent work from Google Maps &mdash; the same place you were found. If getting more steady jobs is on your radar, I can show you 2&ndash;3 specific fixes for {{name}}.</p><p>Worth a 10 minute call this week?</p><p>Best,<br>{{sender_name}}</p><p style="font-size: 12px; color: #666; margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px;">{{business_address}}<br>You are receiving this because {{name}} is listed publicly. <a href="{{unsubscribe_url}}">Unsubscribe</a>.</p></div>';
  return { subject, body, body_html };
}
function buildMessage(cfg, lead, templatesFile) {
  const { subject: subjTpl, body: bodyTpl, body_html: htmlTpl } = resolveTemplate(cfg, lead.category, templatesFile);
  const subject = fillTpl(subjTpl, lead, cfg);
  const link = unsubLink(cfg, lead.email);
  const baseUrl = String(cfg.unsubscribe_base_url||'').replace(/\/$/,'') || '';
  let htmlRaw = fillTpl(htmlTpl, lead, cfg).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfg.business_address||'');
  // Inject pixel if we have a base URL
  if (baseUrl) {
    try{
      const { signPixel } = require(path.join(ROOT, 'email-events.js'));
      const pix = signPixel(lead.email);
      const pixelUrl = baseUrl + '/t/open?e=' + pix.b + '&t=' + pix.tok;
      const pTag = '<img src="'+pixelUrl+'" width="1" height="1" style="display:none" alt="" />';
      htmlRaw = htmlRaw.includes('</div>') ? htmlRaw.replace('</div>', pTag + '</div>') : htmlRaw + pTag;
    }catch(_){}
  }
  const plain = fillTpl(bodyTpl, lead, cfg).replace('{{unsubscribe_url}}', link).replace('{{business_address}}', cfg.business_address||'');
  const html = htmlRaw;
  const fullText = plain + '\n\n' + (cfg.business_address||'') + '\n\nUnsubscribe: ' + link;
  return { to: lead.email, from: `${cfg.from.name} <${cfg.from.address}>`, replyTo: cfg.reply_to||cfg.from.address, subject, text: fullText, html, plain, link, headers: { 'X-Campaign': campaignName(cfg) } };
}

async function loadAllLeads() {
  const ExcelJS = require('exceljs');
  const outDir = path.join(ROOT, 'output');
  let files=[];
  try { files = fs.readdirSync(outDir).filter(f=>f.endsWith('.xlsx')).map(f=>path.join(outDir,f)); } catch(_){ files=[]; }
  const rawLeads=[];
  for (const f of files) {
    try {
      const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
      const ws=wb.worksheets[0];
      const header=ws.getRow(1).values;
      const idx={};
      header.forEach((h,i)=>{ if(!h) return; const k=String(h).trim().toLowerCase(); if(k==='name') idx.name=i; if(k==='email') idx.email=i; if(k==='category') idx.category=i; if(k==='area'||k==='scrapedfrom'){ if(idx.area==null) idx.area=i; } if(k==='website') idx.website=i; });
      ws.eachRow((row,n)=>{ if(n===1) return; const v=(i)=>{ const x=row.values[i]; if(x==null) return ''; return typeof x==='object'? String(x.text||x.result||''):String(x).trim(); }; rawLeads.push({ name:v(idx.name), email:v(idx.email), category:v(idx.category), area:v(idx.area), website:v(idx.website), source: path.basename(f) }); });
    } catch(_){}
  }
  return rawLeads;
}

async function computeCounts({ resend, sheetStatuses, templatesFile } = {}) {
  const cfg = loadConfig();
  const sup = loadSuppression();
  const sentLog = loadSentLog();
  const campaign = campaignName(cfg);
  const rawLeads = await loadAllLeads();
  const raw = rawLeads.length;
  const withEmail = rawLeads.filter(l=> l.email && String(l.email).includes('@')).length;
  const r = cleanLeads(rawLeads, sup, sentLog, { campaign, resend: !!resend, sheetStatuses: sheetStatuses || null });
  // also compute deliveredInSheet for display
  return {
    raw, withEmail, unique: r.pass2.length, sendable: r.sendable.length,
    direct: r.directCount, role: r.roleCount,
    suppressed: r.pass3.length - r.notSup.length,
    deliveredInSheet: r.deliveredInSheet || 0,
    leads: r.sendable, allPass3: r.pass3, notSup: r.notSup,
    campaign, cfg, sup, sentLog
  };
}

// ---- Pixel ----
app.get('/t/open', (req,res)=>{
  try{
    const { verifyPixel, recordOpen } = require(path.join(ROOT, 'email-events.js'));
    const email = verifyPixel(req.query.e, req.query.t);
    if(email) recordOpen(email, { ip: req.ip||req.headers['x-forwarded-for']||'', ua: req.headers['user-agent']||'' });
  }catch(_){}
  sendPixel(res);
});
app.get('/o.gif', (req,res)=>{
  try{
    const { verifyPixel, recordOpen } = require(path.join(ROOT, 'email-events.js'));
    const email = verifyPixel(req.query.e, req.query.t);
    if(email) recordOpen(email, { ip: req.ip||'', ua: req.headers['user-agent']||'' });
  }catch(_){}
  sendPixel(res);
});

// ---- Stats ----
app.get('/api/stats', (req,res)=>{
  try{
    const { getStats }=require(path.join(ROOT,'email-events.js'));
    res.json(getStats());
  }catch(e){ res.status(500).send(e.message); }
});
app.get('/api/events', (req,res)=>{
  try{
    const { loadEvents }=require(path.join(ROOT,'email-events.js'));
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
app.get('/api/export/csv', (req,res)=>{
  try{
    const { loadEvents }=require(path.join(ROOT,'email-events.js'));
    const vals=Object.values(loadEvents()).filter(v=>v && v.email);
    const esc=v=> '"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const header=['email','name','category','area','tab','campaign','sentAt','messageId','smtp','bouncedAt','openCount','firstOpenAt','lastOpenAt','repliedAt','replySubject'];
    let csv=header.join(',')+'\n';
    for(const v of vals) csv+=[esc(v.email),esc(v.name),esc(v.category),esc(v.area),esc(v.tab),esc(v.campaign),esc(v.sentAt),esc(v.messageId),esc(v.smtp),esc(v.bouncedAt),esc(v.openCount),esc(v.firstOpenAt),esc(v.lastOpenAt),esc(v.repliedAt),esc(v.replySubject)].join(',')+'\n';
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="email-events.csv"');
    res.send(csv);
  }catch(e){ res.status(500).send(e.message); }
});
app.post('/api/imap/poll', async (req,res)=>{
  try{
    const { pollOnce }=require(path.join(ROOT,'email-imap-poller.js'));
    const r=await pollOnce();
    res.json(r);
  }catch(e){ res.status(500).json({ error: String(e.message||e).slice(0,400) }); }
});
app.get('/api/imap/status', (req,res)=>{
  try{
    const st=(()=>{ try{ return JSON.parse(fs.readFileSync(path.join(ROOT,'email-imap-state.json'),'utf8')); }catch(_){ return null; }})();
    const { loadImapConfig }=require(path.join(ROOT,'email-imap-poller.js'));
    const cfg=loadImapConfig();
    res.json({ state: st, imapConfigured: !!cfg, host: cfg?cfg.host:null });
  }catch(e){ res.status(500).send(e.message); }
});

// ---- SMTP verify cache (so /api/overview never blocks) ----
let __smtpCache = { ok: null, error: null, at: 0 };
let __smtpInFlight = null;
async function checkSmtp(cfg){
  if(__smtpInFlight) return __smtpInFlight;
  const host=cfg?.smtp?.host, port=cfg?.smtp?.port;
  if(!host || !port){ __smtpCache={ok:false, error:'smtp not configured', at: Date.now()}; return __smtpCache; }
  __smtpInFlight = (async()=>{
    const nm=require('nodemailer');
    const t=nm.createTransport({ host, port, secure: port===465, auth:{user:cfg.smtp.user, pass:cfg.smtp.pass}, tls:{rejectUnauthorized:false}, connectionTimeout:7000, greetingTimeout:7000, socketTimeout:7000, requireTLS: port===587 });
    try{
      await Promise.race([
        t.verify(),
        new Promise((_,rej)=> setTimeout(()=>rej(new Error('Timeout')), 7500))
      ]);
      __smtpCache={ok:true, error:null, at: Date.now()};
    }catch(e){
      __smtpCache={ok:false, error:String(e.message||e).slice(0,400), at: Date.now()};
    }finally{ try{t.close()}catch(_){}; __smtpInFlight=null; }
    return __smtpCache;
  })();
  return __smtpInFlight;
}
function getCachedSmtp(){ return { ok: __smtpCache.ok, error: __smtpCache.error }; }

// ---- API ----

app.get('/api/overview', async (req,res)=>{
  try {
    const useSheet = req.query.sheet !== '0';
    let sheetStatuses=null, sheetOk=null, sheetErr=null;
    if (useSheet) {
      try { const r=await readSheetStatuses(); sheetStatuses=r.statuses; sheetOk=true; } catch(e){ sheetOk=false; sheetErr=String(e.message||e).slice(0,400); }
    }
    const resend = req.query.resend==='1';
    const c = await computeCounts({ resend, sheetStatuses });
    // non-blocking: return cached status instantly, refresh in background if stale (>60s)
    let { ok: smtp_ok, error: smtp_error } = getCachedSmtp();
    if (Date.now() - __smtpCache.at > 60000) { checkSmtp(c.cfg).catch(()=>{}); }
    const templatesFile = loadTemplates();
    let preview=null;
    if (c.leads.length) {
      const lead=c.leads[0];
      const msg=buildMessage(c.cfg, lead, templatesFile);
      preview={ to: msg.to, name: lead.name, category: lead.category, area: lead.area, subject: msg.subject, text: msg.text, html: msg.html };
    }
    let stats=null; try{ stats=require(path.join(ROOT,'email-events.js')).getStats(); }catch(_){}
    res.json({
      sendable:c.sendable, direct:c.direct, role:c.role, suppressed:c.suppressed, deliveredInSheet:c.deliveredInSheet,
      raw:c.raw, withEmail:c.withEmail, unique:c.unique,
      from:c.cfg.from, reply_to:c.cfg.reply_to, subject:c.cfg.subject, smtp:c.cfg.smtp,
      unsubscribe_base_url:c.cfg.unsubscribe_base_url, business_address:c.cfg.business_address,
      per_hour:c.cfg.per_hour, per_batch:c.cfg.per_batch, batch_pause_seconds:c.cfg.batch_pause_seconds,
      campaign:c.campaign, preview, smtp_ok, smtp_error,
      sheet: useSheet ? { ok: sheetOk, error: sheetErr, statuses: sheetStatuses ? sheetStatuses.size : 0 } : { ok:null },
      stats,
      templates: Object.keys(templatesFile.templates||{}),
    });
  } catch(e){ res.status(500).send('overview failed: '+e.message); }
});

app.get('/api/preview', async (req,res)=>{
  try {
    const limit=Math.min(50, Math.max(1, parseInt(req.query.limit,10)||5));
    const resend=req.query.resend==='1';
    const useSheet=req.query.sheet!=='0';
    let sheetStatuses=null;
    if (useSheet) { try{ const r=await readSheetStatuses(); sheetStatuses=r.statuses; }catch(_){ } }
    const c=await computeCounts({ resend, sheetStatuses });
    const templatesFile=loadTemplates();
    const slice=c.leads.slice(0,limit);
    const rows=slice.map(lead=>{
      const msg=buildMessage(c.cfg, lead, templatesFile);
      return { to: msg.to, name: lead.name, category: lead.category, area: lead.area, website: lead.website, subject: msg.subject, text: msg.text, html: msg.html, source: lead.source };
    });
    res.json({ sendable:c.sendable, deliveredInSheet:c.deliveredInSheet, leads: rows });
  } catch(e){ res.status(500).send('preview failed: '+e.message); }
});

app.post('/api/run', async (req,res)=>{
  const mode=String(req.body?.mode||'dry');
  const limit=Math.min(10000, Math.max(1, parseInt(req.body?.limit,10)||5));
  const resend=!!req.body?.resend;
  const useSheet=req.body?.sheet!==false && req.body?.sheet!=='0';
  const writeSheet=!!req.body?.writeSheet;
  const isDry=mode!=='send';
  res.setHeader('Content-Type','application/x-ndjson');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  const sendJSON=(obj)=>{ try{ res.write(JSON.stringify(obj)+'\n'); }catch(_){ } };

  let transport=null;
  try {
    const cfg=loadConfig();
    const sup=loadSuppression();
    const sentLog=loadSentLog();
    const rawCampaign=String(req.body?.campaign||'').trim();
    const campaign= rawCampaign ? sanitizeCampaignName(rawCampaign) : campaignName(cfg);
    const templatesFile=loadTemplates();
    let sheetStatuses=null, byTab=null;
    if (useSheet) {
      try { const r=await readSheetStatuses(); sheetStatuses=r.statuses; byTab=r.byTab; } catch(e){ sendJSON({type:'error', message:'Sheet read failed: '+String(e.message||e).slice(0,400)}); res.end(); return; }
    }
    const c=await computeCounts({ resend, sheetStatuses, templatesFile });
    const total=Math.min(limit, c.leads.length);
    const slice=c.leads.slice(0,total);
    sendJSON({ type:'overview', sendable:c.sendable, direct:c.direct, role:c.role, suppressed:c.suppressed, deliveredInSheet:c.deliveredInSheet, total, sheet: sheetStatuses?{ ok:true, statuses: sheetStatuses.size }:null });

    if (slice.length) {
      const first=slice[0];
      const msg0=buildMessage(cfg, first, templatesFile);
      sendJSON({ type:'preview', sendable:c.sendable, lead:{ to:msg0.to, name:first.name, category:first.category, area:first.area, subject:msg0.subject, text:msg0.text, html:msg0.html }});
    }

    if (!isDry) {
      const nm=require('nodemailer');
      transport={ kind:'nodemailer', t: nm.createTransport({ host:cfg.smtp.host, port:cfg.smtp.port, secure:cfg.smtp.port===465, auth:{user:cfg.smtp.user, pass:cfg.smtp.pass}, tls:{rejectUnauthorized:false}, connectionTimeout:10000, greetingTimeout:10000, socketTimeout:15000 })};
      const perBatch=cfg.per_batch||50;
      const pauseMs=(cfg.batch_pause_seconds||30)*1000;
      const supPath=path.join(ROOT,'email-suppression.json');
      const sentPath=path.join(ROOT,'email-sent-log.json');
      let supLive=(()=>{ try{return JSON.parse(fs.readFileSync(supPath,'utf8'));}catch(_){return {unsubscribed:{},bounced:{},manual:[]}; }})();
      let sentLive=(()=>{ try{return JSON.parse(fs.readFileSync(sentPath,'utf8'));}catch(_){return {};} })();
      let sent=0, failed=0;
      const sheetWrites=[]; // collect for batch write at end
      for(let i=0;i<slice.length;i++){
        const lead=slice[i];
        const msg=buildMessage(cfg, lead, templatesFile);
        // tab/row for events
        let evTab='', evRow=null;
        if(byTab){ for(const [tab, info2] of byTab.entries()){ const r=info2.rowByEmail.get(lead.email.trim().toLowerCase()); if(r){ evTab=tab; evRow=r; break; } } }
        const mid='<'+crypto.randomUUID()+'@cotechagency.com>';
        try{
          const info=await transport.t.sendMail({ from:msg.from, to:msg.to, replyTo:msg.replyTo, subject:msg.subject, text:msg.text, html:msg.html, headers:msg.headers, messageId: mid });
          sent++;
          sentLive[lead.email.trim().toLowerCase()]={ campaign, at:new Date().toISOString(), name:lead.name, area:lead.area };
          try{ fs.writeFileSync(sentPath, JSON.stringify(sentLive,null,2)); }catch(_){}
          try{ require(path.join(ROOT,'email-events.js')).recordSent(lead.email, { campaign, category: lead.category, area: lead.area, name: lead.name, tab: evTab, row: evRow, messageId: info.messageId||mid, detail: String(info.response||'').slice(0,300) }); }catch(_){}
          if (writeSheet && byTab) {
            for(const [tab, info2] of byTab.entries()){
              const row=info2.rowByEmail.get(lead.email.trim().toLowerCase());
              if(row){ sheetWrites.push({ tab, row, status:'DELIVERED' }); break; }
            }
          }
          sendJSON({ type:'progress', sent, failed, total, email:lead.email, ok:true, id: info.messageId||info.response });
        }catch(err){
          failed++;
          const msg2=String(err.message||err);
          try{ require(path.join(ROOT,'email-events.js')).recordBounce(lead.email, { reason: msg2.slice(0,400) }); }catch(_){}
          if(/unknown|does not exist|invalid|no such/i.test(msg2) || err.responseCode===550 || err.responseCode===551){
            const eKey=lead.email.trim().toLowerCase();
            if(!supLive.bounced) supLive.bounced={};
            supLive.bounced[eKey]={at:new Date().toISOString(), detail: msg2.slice(0,300)};
            try{ fs.writeFileSync(supPath, JSON.stringify(supLive,null,2)); }catch(_){}
          }
          sendJSON({ type:'progress', sent, failed, total, email:lead.email, ok:false, error: msg2.slice(0,500) });
        }
        if((i+1)%perBatch===0 && i+1<slice.length){
          sendJSON({ type:'batch_pause', seconds: Math.round(pauseMs/1000) });
          await new Promise(r=>setTimeout(r, pauseMs));
        }
      }
      try{ transport.t.close(); }catch(_){}
      // Flush sheet writes
      if (writeSheet && sheetWrites.length) {
        try {
          // deduplicate by tab+row
          const keySet=new Set(); const dedup=[];
          for(const w of sheetWrites){ const k=w.tab+'\x00'+w.row; if(keySet.has(k)) continue; keySet.add(k); dedup.push(w); }
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

// Email campaigns (history grouped from events — shared with :3000)
app.get('/api/campaigns', (req,res)=>{
  try{
    const { listCampaigns }=require(path.join(ROOT,'email-campaigns.js'));
    res.json({ campaigns: listCampaigns() });
  }catch(e){ res.status(500).send(e.message); }
});
app.get('/api/campaigns/:campaign', (req,res)=>{
  try{
    const { getCampaign, listEmails }=require(path.join(ROOT,'email-campaigns.js'));
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
app.get('/api/email/:email', (req,res)=>{
  try{
    const { getEmail }=require(path.join(ROOT,'email-campaigns.js'));
    const e=getEmail(String(req.params.email||''));
    if(!e) return res.status(404).send('no such email');
    res.json(e);
  }catch(e2){ res.status(500).send(e2.message); }
});

// Templates CRUD
app.get('/api/templates', (req,res)=>{
  try { res.json(loadTemplates()); } catch(e){ res.status(500).send(e.message); }
});
app.get('/api/templates/:category', (req,res)=>{
  const tf=loadTemplates();
  const tpl=templateForCategory(req.params.category, tf);
  if(!tpl) return res.status(404).send('no template for '+req.params.category);
  res.json({ category: req.params.category, ...tpl });
});
app.put('/api/templates/:category', (req,res)=>{
  const cat=String(req.params.category||'').trim();
  if(!cat) return res.status(400).send('category required');
  const { subject, body, body_html } = req.body||{};
  if(typeof subject!=='string' || typeof body!=='string') return res.status(400).send('subject and body required');
  const p=path.join(ROOT,'email-templates.json');
  let data; try{ data=JSON.parse(fs.readFileSync(p,'utf8')); }catch(_){ data={ templates:{} }; }
  if(!data.templates) data.templates={};
  data.templates[cat]={ subject, body, body_html: body_html||'' };
  fs.writeFileSync(p, JSON.stringify(data,null,2));
  res.json({ ok:true, category:cat });
});
app.delete('/api/templates/:category', (req,res)=>{
  const cat=String(req.params.category||'').trim();
  const p=path.join(ROOT,'email-templates.json');
  let data; try{ data=JSON.parse(fs.readFileSync(p,'utf8')); }catch(_){ return res.status(404).send('no templates file'); }
  if(!data.templates || !data.templates[cat]) return res.status(404).send('no such template');
  delete data.templates[cat];
  fs.writeFileSync(p, JSON.stringify(data,null,2));
  res.json({ ok:true });
});

// Config (safe fields only — never returns smtp.pass)
app.put('/api/config', (req,res)=>{
  try{
    const p=path.join(ROOT,'email-config.json');
    let cfg=JSON.parse(fs.readFileSync(p,'utf8'));
    const raw=String(req.body?.campaign_name ?? req.body?.campaign ?? '').trim();
    if(req.body && (Object.prototype.hasOwnProperty.call(req.body,'campaign_name') || Object.prototype.hasOwnProperty.call(req.body,'campaign'))){
      if(!raw){
        delete cfg.campaign_name;
      } else {
        const clean=sanitizeCampaignName(raw);
        cfg.campaign_name=clean;
      }
      fs.writeFileSync(p, JSON.stringify(cfg,null,2));
    }
    res.json({ ok:true, campaign: campaignName(cfg), campaign_name: cfg.campaign_name||null });
  }catch(e){ res.status(500).send(e.message); }
});
app.get('/api/config', (req,res)=>{
  try {
    const cfg=loadConfig();
    const safe={ ...cfg, smtp:{ ...cfg.smtp, pass: cfg.smtp.pass ? '••••••••' : '' } };
    res.json(safe);
  } catch(e){ res.status(500).send(e.message); }
});

app.get('/api/health/smtp', async (req,res)=>{
  try{ const cfg=loadConfig(); const r=await checkSmtp(cfg); res.json({ ok:r.ok, error:r.error, at:r.at }); }catch(e){ res.status(500).json({ ok:false, error:String(e.message||e).slice(0,400)}); }
});

app.get('/health', (req,res)=> res.json({ ok:true, standalone:true, port:PORT }));

app.listen(PORT, ()=> {
  console.log(`[email-tool] listening on http://localhost:${PORT}`);
  try { require(path.join(ROOT,'email-imap-poller.js')).startPoller(); } catch(_) {}
});
