/**
 * email-events.js — shared event store for open/reply/bounce tracking.
 * Both the main server (:3000) and standalone tool (:3003) require this file.
 * Store: email-events.json at repo root, keyed by lowerEmail.
 */
const fs2 = require('fs');
const path2 = require('path');
const crypto = require('crypto');
const EVENTS_FILE = path2.join(__dirname, 'email-events.json');

function pixelSecret(){
  try{
    const cfg=JSON.parse(fs2.readFileSync(path2.join(__dirname,'email-config.json'),'utf8'));
    return cfg.unsubscribe_secret || (cfg.smtp && cfg.smtp.pass) || 'unsub-secret';
  }catch(_){ return 'unsub-secret'; }
}
function loadEvents(){
  try{ return JSON.parse(fs2.readFileSync(EVENTS_FILE,'utf8')); }catch(_){ return {}; }
}
function saveEvents(obj){
  const tmp=EVENTS_FILE+'.tmp';
  fs2.writeFileSync(tmp, JSON.stringify(obj,null,2));
  fs2.renameSync(tmp, EVENTS_FILE);
}
function recordSent(email, info){
  const e=String(email||'').trim().toLowerCase();
  if(!e||!e.includes('@')) return;
  const ev=loadEvents();
  const now=new Date().toISOString();
  const prev=ev[e]||{};
  ev[e]={
    ...prev,
    email:e,
    campaign: info.campaign||prev.campaign||'',
    category: info.category||prev.category||'',
    area: info.area||prev.area||'',
    name: info.name||prev.name||'',
    tab: info.tab||prev.tab||'',
    row: info.row||prev.row||null,
    sentAt: now,
    messageId: info.messageId||prev.messageId||'',
    smtp: 'accepted',
    smtpDetail: info.detail||'',
    failReason: null,
    bouncedAt: prev.bouncedAt||null,
    bounceDetail: prev.bounceDetail||null,
    opens: prev.opens||[],
    openCount: prev.openCount||0,
    firstOpenAt: prev.firstOpenAt||null,
    lastOpenAt: prev.lastOpenAt||null,
    repliedAt: prev.repliedAt||null,
    replySubject: prev.replySubject||null,
    replyFrom: prev.replyFrom||null,
    replySnippet: prev.replySnippet||null,
  };
  saveEvents(ev);
}
function recordBounce(email, info){
  const e=String(email||'').trim().toLowerCase();
  if(!e) return;
  const ev=loadEvents();
  const now=new Date().toISOString();
  const prev=ev[e]||{ email:e, opens:[], openCount:0 };
  ev[e]={
    ...prev,
    email:e,
    smtp: 'failed',
    failReason: (info&&info.reason)||prev.failReason||'bounced',
    bouncedAt: now,
    bounceDetail: (info&&info.reason)||prev.bounceDetail||'',
  };
  saveEvents(ev);
}
function recordOpen(email, meta){
  const e=String(email||'').trim().toLowerCase();
  if(!e) return false;
  const ev=loadEvents();
  const now=new Date().toISOString();
  const prev=ev[e]||{ email:e, opens:[], openCount:0 };
  if(!prev.opens) prev.opens=[];
  prev.opens.push({ at: now, ip: (meta&&meta.ip)||'', ua: (meta&&meta.ua)||'' });
  prev.openCount=(prev.openCount||0)+1;
  if(!prev.firstOpenAt) prev.firstOpenAt=now;
  prev.lastOpenAt=now;
  prev.email=e;
  ev[e]=prev;
  saveEvents(ev);
  return true;
}
function recordReply(email, info){
  const e=String(email||'').trim().toLowerCase();
  if(!e) return false;
  const ev=loadEvents();
  const now=(info&&info.at)||new Date().toISOString();
  const prev=ev[e]||{ email:e, opens:[], openCount:0 };
  prev.repliedAt=now;
  prev.replySubject=(info&&info.subject)||prev.replySubject||'';
  prev.replyFrom=(info&&info.from)||prev.replyFrom||e;
  prev.replySnippet=(info&&info.snippet)||prev.replySnippet||'';
  prev.email=e;
  ev[e]=prev;
  saveEvents(ev);
  return true;
}
function signPixel(email){
  const e=String(email||'').trim().toLowerCase();
  const secret=pixelSecret();
  const tok=crypto.createHmac('sha256', secret).update(e).digest('hex');
  const b=Buffer.from(e).toString('base64url');
  return { b, tok };
}
function verifyPixel(b, tok){
  try{
    const email=Buffer.from(String(b||''),'base64url').toString('utf8').trim().toLowerCase();
    if(!email||!email.includes('@')) return null;
    const secret=pixelSecret();
    const expect=crypto.createHmac('sha256', secret).update(email).digest('hex');
    const a=Buffer.from(expect);
    const c=Buffer.from(String(tok||''));
    if(a.length!==c.length) return null;
    if(!crypto.timingSafeEqual(a,c)) return null;
    return email;
  }catch(_){ return null; }
}
function getStats(){
  const ev=loadEvents();
  const vals=Object.values(ev).filter(v=>v && v.email);
  const delivered=vals.filter(v=>v.smtp==='accepted').length;
  const bounced=vals.filter(v=>v.smtp==='failed' || v.bouncedAt).length;
  const opened=vals.filter(v=> (v.openCount||0)>0).length;
  const replied=vals.filter(v=> !!v.repliedAt).length;
  const total=vals.length;
  const openRate= delivered ? Math.round(opened/delivered*100) : 0;
  const replyRate= delivered ? Math.round(replied/delivered*100) : 0;
  const byCategory={};
  for(const v of vals){
    const cat=v.category||'Unknown';
    if(!byCategory[cat]) byCategory[cat]={ delivered:0, bounced:0, opened:0, replied:0 };
    if(v.smtp==='accepted') byCategory[cat].delivered++;
    if(v.smtp==='failed'||v.bouncedAt) byCategory[cat].bounced++;
    if((v.openCount||0)>0) byCategory[cat].opened++;
    if(v.repliedAt) byCategory[cat].replied++;
  }
  const recentOpens=vals.filter(v=>v.lastOpenAt).sort((a,b)=> String(b.lastOpenAt).localeCompare(String(a.lastOpenAt))).slice(0,20).map(v=>({ email:v.email, name:v.name, category:v.category, openCount:v.openCount, firstOpenAt:v.firstOpenAt, lastOpenAt:v.lastOpenAt }));
  const recentReplies=vals.filter(v=>v.repliedAt).sort((a,b)=> String(b.repliedAt).localeCompare(String(a.repliedAt))).slice(0,20).map(v=>({ email:v.email, name:v.name, category:v.category, repliedAt:v.repliedAt, replySubject:v.replySubject, replyFrom:v.replyFrom }));
  let imapState=null;
  try{ imapState=JSON.parse(fs2.readFileSync(path2.join(__dirname,'email-imap-state.json'),'utf8')); }catch(_){}
  return { total, delivered, bounced, undelivered:bounced, opened, openRate, replied, replyRate, byCategory, recentOpens, recentReplies, imap: imapState, eventsCount: total };
}
module.exports={ EVENTS_FILE, loadEvents, saveEvents, recordSent, recordBounce, recordOpen, recordReply, signPixel, verifyPixel, getStats, pixelSecret };
