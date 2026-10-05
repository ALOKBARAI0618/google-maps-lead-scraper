/**
 * email-campaigns.js — campaign history helpers.
 * Both servers share this so :3000 and :3003 show same campaigns.
 * Campaigns are derived from email-events.json grouped by `campaign` field.
 * No extra JSON file needed — history is the events themselves.
 */
const path = require('path');
const fs = require('fs');

function loadEventsRaw(){
  try { return JSON.parse(fs.readFileSync(path.join(__dirname,'email-events.json'),'utf8')); } catch(_){ return {}; }
}

function listCampaigns(){
  const ev = loadEventsRaw();
  const vals = Object.values(ev).filter(v=>v && v.email);
  const map = new Map();
  for(const v of vals){
    const c = String(v.campaign||'unknown').trim() || 'unknown';
    if(!map.has(c)) map.set(c, []);
    map.get(c).push(v);
  }
  const out = [];
  for(const [campaign, arr] of map.entries()){
    const delivered = arr.filter(v=>v.smtp==='accepted').length;
    const bounced = arr.filter(v=>v.smtp==='failed' || v.bouncedAt).length;
    const opened = arr.filter(v=> (v.openCount||0)>0).length;
    const replied = arr.filter(v=> !!v.repliedAt).length;
    const total = arr.length;
    const openRate = delivered ? Math.round(opened/delivered*100) : 0;
    const replyRate = delivered ? Math.round(replied/delivered*100) : 0;
    const times = arr.map(v=>v.sentAt||'').filter(Boolean).sort();
    const lastTimes = arr.map(v=>v.lastOpenAt||v.repliedAt||v.sentAt||'').filter(Boolean).sort();
    const firstAt = times[0]||null;
    const lastAt = lastTimes[lastTimes.length-1]||times[times.length-1]||null;
    const cats = [...new Set(arr.map(v=>v.category).filter(Boolean))];
    const areas = [...new Set(arr.map(v=>v.area).filter(Boolean))].slice(0,5);
    out.push({ campaign, total, delivered, bounced, opened, openRate, replied, replyRate, firstAt, lastAt, categories: cats, areas });
  }
  out.sort((a,b)=> String(b.lastAt||'').localeCompare(String(a.lastAt||'')) );
  return out;
}

function getCampaign(campaign){
  const name = String(campaign||'').trim();
  if(!name) return null;
  const all = listCampaigns();
  return all.find(c=>c.campaign===name) || null;
}

function listEmails(campaign, opts){
  opts = opts||{};
  const ev = loadEventsRaw();
  let vals = Object.values(ev).filter(v=>v && v.email);
  if(campaign) vals = vals.filter(v=> String(v.campaign||'')===String(campaign));
  const q = String(opts.q||'').toLowerCase().trim();
  if(q) vals = vals.filter(v=> String(v.email||'').toLowerCase().includes(q) || String(v.name||'').toLowerCase().includes(q) || String(v.category||'').toLowerCase().includes(q));
  const status = String(opts.status||'').toLowerCase();
  if(status==='delivered' || status==='accepted') vals = vals.filter(v=>v.smtp==='accepted');
  else if(status==='bounced' || status==='failed' || status==='undelivered') vals = vals.filter(v=>v.smtp==='failed' || v.bouncedAt);
  else if(status==='opened') vals = vals.filter(v=> (v.openCount||0)>0);
  else if(status==='replied') vals = vals.filter(v=> !!v.repliedAt);
  else if(status==='unopened') vals = vals.filter(v=> !(v.openCount>0));
  const sortBy = String(opts.sortBy||'sentAt');
  const dir = opts.dir==='asc' ? 1 : -1;
  vals.sort(function(a,b){
    const av = String(a[sortBy]||a.sentAt||'');
    const bv = String(b[sortBy]||b.sentAt||'');
    return av.localeCompare(bv)*dir;
  });
  const total = vals.length;
  const limit = Math.min(500, Math.max(1, parseInt(opts.limit,10)||50));
  const offset = Math.max(0, parseInt(opts.offset,10)||0);
  vals = vals.slice(offset, offset+limit);
  return { total: total, limit: limit, offset: offset, emails: vals };
}

function getEmail(email){
  const e = String(email||'').trim().toLowerCase();
  if(!e) return null;
  const ev = loadEventsRaw();
  return ev[e] || null;
}

module.exports = { listCampaigns: listCampaigns, getCampaign: getCampaign, listEmails: listEmails, getEmail: getEmail };
