#!/usr/bin/env node
/**
 * Lead Calling Assistant — Fast Keyboard-Driven CRM Updater
 * Designed for rapid telecalling updates directly into Excel (.xlsx).
 *
 * Supported CRM Fields:
 *   1. Call
 *   2. Not Call
 *   3. Asking for Detailed
 *   4. Directly Rejected
 *   5. Follow Up Date
 *   6. What was discussed on call?
 *   7. Notes
 *
 * Usage:
 *   node lead-caller.js
 *   node lead-caller.js "Mumbai Data.xlsx"
 */

const ExcelJS = require('exceljs');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = fs.existsSync(path.join(__dirname, 'Mumbai Data.xlsx'))
  ? path.join(__dirname, 'Mumbai Data.xlsx')
  : path.join(__dirname, 'sample-leads.xlsx');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

function stamp() {
  const d = new Date();
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

class LeadCaller {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = null;
    this.worksheet = null;
    this.colMap = {};
    this.leads = [];
    this.currentIndex = 0;
    this.stats = {
      viewed: 0,
      called: 0,
      interested: 0,
      callback: 0,
      rejected: 0,
      noAnswer: 0,
    };
  }

  async init() {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`Excel file not found: ${this.filePath}`);
    }

    // Create automatic safety backup
    const dir = path.dirname(this.filePath);
    const ext = path.extname(this.filePath);
    const base = path.basename(this.filePath, ext);
    const backupPath = path.join(dir, `${base}.BACKUP-${Date.now()}${ext}`);
    try {
      fs.copyFileSync(this.filePath, backupPath);
      console.log(`🛡️  Safety backup created: ${path.basename(backupPath)}`);
    } catch (err) {
      console.log(`⚠️ Backup warning: ${err.message}`);
    }

    this.workbook = new ExcelJS.Workbook();
    await this.workbook.xlsx.readFile(this.filePath);
    this.worksheet = this.workbook.getWorksheet('Leads') || this.workbook.worksheets[0];

    if (!this.worksheet) throw new Error('No valid worksheet found.');

    // Map column names to column numbers
    this.worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
      const val = String(cell.value || '').trim();
      if (val) this.colMap[val] = colNum;
    });

    // Ensure required CRM columns exist
    const requiredCrm = [
      'Call', 'Not Call', 'Asking for Detailed', 'Directly Rejected',
      'Follow Up Date', 'What was discussed on call?', 'Notes'
    ];
    let nextCol = this.worksheet.columnCount + 1;
    for (const colName of requiredCrm) {
      if (!this.colMap[colName]) {
        this.colMap[colName] = nextCol++;
        const cell = this.worksheet.getRow(1).getCell(this.colMap[colName]);
        cell.value = colName;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E4D45' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    }

    this.loadLeads();
  }

  getVal(rowNum, colName) {
    const colNum = this.colMap[colName];
    if (!colNum) return '';
    const val = this.worksheet.getCell(rowNum, colNum).value;
    if (val && typeof val === 'object') return val.text || val.result || '';
    return String(val == null ? '' : val).trim();
  }

  setVal(rowNum, colName, value) {
    const colNum = this.colMap[colName];
    if (!colNum) return;
    this.worksheet.getCell(rowNum, colNum).value = value;
  }

  loadLeads() {
    this.leads = [];
    const phoneCol = this.colMap['Phone 1'] || this.colMap['Phone'] || this.colMap['phone1'];

    for (let r = 2; r <= this.worksheet.rowCount; r++) {
      const name = this.getVal(r, 'Name');
      if (!name) continue;
      const phone = phoneCol ? this.getVal(r, this.worksheet.getRow(1).getCell(phoneCol).value) : '';
      const callStatus = this.getVal(r, 'Call');

      this.leads.push({
        row: r,
        sno: this.getVal(r, 'S.No') || (r - 1),
        name: name,
        category: this.getVal(r, 'Category'),
        area: this.getVal(r, 'Area') || this.getVal(r, 'Scraped From'),
        phone: phone,
        website: this.getVal(r, 'Website'),
        rating: this.getVal(r, 'Rating'),
        reviews: this.getVal(r, 'Reviews'),
        mapsUrl: this.getVal(r, 'Google Maps URL'),
        call: callStatus,
        notCall: this.getVal(r, 'Not Call'),
        detailed: this.getVal(r, 'Asking for Detailed'),
        rejected: this.getVal(r, 'Directly Rejected'),
        followUp: this.getVal(r, 'Follow Up Date'),
        discussed: this.getVal(r, 'What was discussed on call?'),
        notes: this.getVal(r, 'Notes'),
      });
    }
  }

  async save() {
    let attempts = 0;
    while (attempts < 5) {
      try {
        await this.workbook.xlsx.writeFile(this.filePath);
        return true;
      } catch (err) {
        if (err.code === 'EBUSY' || /EBUSY|being used/i.test(err.message)) {
          console.log('\n❌ [FILE LOCKED] The Excel file is currently open in Microsoft Excel.');
          await ask('👉 Please SAVE & CLOSE Microsoft Excel, then press [Enter] to retry...');
          attempts++;
        } else {
          console.log('\n❌ Save error:', err.message);
          return false;
        }
      }
    }
    console.log('⚠️ Could not save directly. Please close Excel before continuing.');
    return false;
  }

  displayLead(lead) {
    console.log('\n' + '='.repeat(68));
    console.log(`📞 LEAD [${this.currentIndex + 1}/${this.leads.length}] (S.No: ${lead.sno})  |  Session Calls: ${this.stats.called}`);
    console.log('='.repeat(68));
    console.log(`🏢 Business : ${lead.name}`);
    console.log(`📍 Location : ${lead.area || 'N/A'}  |  Category: ${lead.category || 'N/A'}`);
    console.log(`📱 Phone    : ${lead.phone || 'NO PHONE'}`);
    console.log(`⭐ Rating   : ${lead.rating || 'N/A'} (${lead.reviews || 0} reviews)  |  Web: ${lead.website || 'No website'}`);
    if (lead.mapsUrl) console.log(`🗺️  Maps URL : ${lead.mapsUrl}`);
    console.log('-'.repeat(68));
    console.log('📊 Current CRM Status:');
    console.log(`   Call: [${lead.call || '-'}]   Not Call: [${lead.notCall || '-'}]   Asking for Detailed: [${lead.detailed || '-'}]`);
    console.log(`   Directly Rejected: [${lead.rejected || '-'}]   Follow Up: [${lead.followUp || '-'}]`);
    console.log(`   Discussed: ${lead.discussed || '-'}`);
    if (lead.notes) console.log(`   Notes: ${lead.notes}`);
    console.log('='.repeat(68));
    console.log('⚡ INSTANT 1-KEY ACTIONS (Auto-Saves & Jumps to Next Lead):');
    console.log('  [1] Call Done (Yes)            [2] Do Not Call (Yes)');
    console.log('  [3] Asking for Details (Yes)   [4] Directly Rejected (Yes)');
    console.log('  [5] Set Follow-Up Date         [6] What was discussed?');
    console.log('  [7] Add Notes                  [0 / X] No Answer / Switched Off');
    console.log('  [W] WhatsApp Link');
    console.log('🧭 NAVIGATION:');
    console.log('  [Enter / K] Skip to Next Lead   [P] Previous Lead   [J] Jump to S.No   [Q] Save & Quit');
    console.log('-'.repeat(68));
  }

  async handleInput(lead) {
    const r = lead.row;
    const choice = (await ask('👉 Action: ')).trim();
    const key = choice.toUpperCase();

    if (key === '' || key === 'K') {
      console.log('   ⏭️  Skipped to next lead.');
      this.currentIndex++;
      return;
    }
    if (key === 'P') {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        console.log('   ⏮️  Moved to previous lead.');
      } else {
        console.log('   ⚠️ Already at the first lead.');
      }
      return;
    }
    if (key === 'Q') {
      return 'QUIT';
    }
    if (key === 'J') {
      const num = parseInt(await ask('Enter Lead Number (1 to ' + this.leads.length + '): '), 10);
      if (num >= 1 && num <= this.leads.length) {
        this.currentIndex = num - 1;
      }
      return;
    }

    if (key === '1') {
      // Direct Call Done!
      lead.call = 'Yes';
      this.setVal(r, 'Call', 'Yes');
      this.stats.called++;
      await this.save();
      console.log('   ✅ [SAVED] Call = Yes ➔ Moving to next lead...');
      this.currentIndex++;
      return;
    } else if (key === '2') {
      // Direct Not Call!
      lead.notCall = 'Yes';
      this.setVal(r, 'Not Call', 'Yes');
      this.stats.called++;
      await this.save();
      console.log('   ✅ [SAVED] Not Call = Yes ➔ Moving to next lead...');
      this.currentIndex++;
      return;
    } else if (key === '3' || key === 'A') {
      // Asking for Detailed / Interested
      lead.call = 'Yes';
      lead.detailed = 'Yes';
      this.setVal(r, 'Call', 'Yes');
      this.setVal(r, 'Asking for Detailed', 'Yes');
      const disc = await ask('   What was discussed? (Press Enter to skip): ');
      if (disc.trim()) {
        lead.discussed = disc.trim();
        this.setVal(r, 'What was discussed on call?', lead.discussed);
      }
      this.stats.called++;
      this.stats.interested++;
      await this.save();
      console.log('   ✅ [SAVED] Asking for Detailed = Yes ➔ Moving to next lead...');
      this.currentIndex++;
      return;
    } else if (key === '4' || key === 'Z') {
      // Directly Rejected
      lead.call = 'Yes';
      lead.rejected = 'Yes';
      lead.notCall = 'Yes';
      lead.discussed = 'Not interested / Directly rejected offer';
      this.setVal(r, 'Call', 'Yes');
      this.setVal(r, 'Directly Rejected', 'Yes');
      this.setVal(r, 'Not Call', 'Yes');
      this.setVal(r, 'What was discussed on call?', lead.discussed);
      this.stats.called++;
      this.stats.rejected++;
      await this.save();
      console.log('   ⛔ [SAVED] Directly Rejected = Yes ➔ Moving to next lead...');
      this.currentIndex++;
      return;
    } else if (key === '5' || key === 'B') {
      // Follow-up Date / Callback
      lead.call = 'Yes';
      this.setVal(r, 'Call', 'Yes');
      console.log('   Follow-up: [1] Tomorrow  [2] In 2 Days  [3] Next Monday  [4] Custom Date/Time');
      const sub = (await ask('   Select: ')).trim();
      let dateVal = '';
      if (sub === '1') {
        const d = new Date(); d.setDate(d.getDate() + 1); dateVal = d.toLocaleDateString('en-GB');
      } else if (sub === '2') {
        const d = new Date(); d.setDate(d.getDate() + 2); dateVal = d.toLocaleDateString('en-GB');
      } else if (sub === '3') {
        const d = new Date(); d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7)); dateVal = d.toLocaleDateString('en-GB');
      } else {
        dateVal = await ask('   Enter Date (e.g. Tomorrow 4 PM or 10/09/2026): ');
      }
      if (dateVal.trim()) {
        lead.followUp = dateVal.trim();
        this.setVal(r, 'Follow Up Date', lead.followUp);
      }
      this.stats.called++;
      this.stats.callback++;
      await this.save();
      console.log('   📅 [SAVED] Follow-up date set ➔ Moving to next lead...');
      this.currentIndex++;
      return;
    } else if (key === '6') {
      // What was discussed
      lead.call = 'Yes';
      this.setVal(r, 'Call', 'Yes');
      console.log('   Presets:');
      console.log('     [1] Interested - Requested portfolio and quotation');
      console.log('     [2] Owner busy - Requested callback later');
      console.log('     [3] Already satisfied with existing agency');
      console.log('     [4] Custom summary (type your own)');
      const sub = (await ask('   Select: ')).trim();
      let summary = '';
      if (sub === '1') summary = 'Interested - Requested portfolio and quotation';
      else if (sub === '2') summary = 'Owner busy - Requested callback later';
      else if (sub === '3') summary = 'Already satisfied with existing agency';
      else summary = await ask('   What was discussed? ');
      if (summary.trim()) {
        lead.discussed = summary.trim();
        this.setVal(r, 'What was discussed on call?', lead.discussed);
      }
      this.stats.called++;
      await this.save();
      console.log('   📝 [SAVED] Discussion summary saved ➔ Moving to next lead...');
      this.currentIndex++;
      return;
    } else if (key === '7') {
      // Add Notes
      const extra = await ask('   Enter Note: ');
      if (extra.trim()) {
        const fullNote = lead.notes ? `${lead.notes} | [${stamp()}] ${extra.trim()}` : `[${stamp()}] ${extra.trim()}`;
        lead.notes = fullNote;
        this.setVal(r, 'Notes', fullNote);
      }
      await this.save();
      console.log('   💾 [SAVED] Note saved ➔ Moving to next lead...');
      this.currentIndex++;
      return;
    } else if (key === '0' || key === 'X') {
      // No Answer
      lead.call = 'Pending';
      lead.notCall = 'No';
      lead.discussed = 'No answer / Switched off / Ringing';
      const prev = lead.notes ? `${lead.notes} | ` : '';
      lead.notes = `${prev}[${stamp()}] No Answer`;
      this.setVal(r, 'Call', 'Pending');
      this.setVal(r, 'Not Call', 'No');
      this.setVal(r, 'What was discussed on call?', lead.discussed);
      this.setVal(r, 'Notes', lead.notes);
      this.stats.noAnswer++;
      await this.save();
      console.log('   📵 [SAVED] Logged "No Answer" ➔ Moving to next lead...');
      this.currentIndex++;
      return;
    } else if (key === 'W') {
      // WhatsApp link generator
      const cleanPhone = String(lead.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanPhone.length === 10) {
        const msg = `Hello! Regarding our conversation about ${lead.name}, please find the details here.`;
        const link = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;
        console.log('\n📲 WhatsApp Direct Link (Copy and paste in browser):');
        console.log(`   ${link}\n`);
      } else {
        console.log('   ⚠️ Valid 10-digit mobile number not found for WhatsApp.');
      }
      return;
    } else {
      console.log('   ⚠️ Unrecognized option. Use 0-7, Enter (skip), P (prev), J (jump), or Q (exit).');
      return;
    }
  }

  async run() {
    console.log('\n' + '='.repeat(68));
    console.log('   📞 MAPLEADS CRM — LEAD CALLING CO-PILOT ASSISTANT');
    console.log('   Target File: ' + path.basename(this.filePath));
    console.log('='.repeat(68));

    const filterChoice = (await ask('Filter options:\n  [1] Uncalled leads only (Recommended)\n  [2] All leads\nChoice [1]: ')).trim();
    if (filterChoice !== '2') {
      this.leads = this.leads.filter(l => !l.call || l.call.toLowerCase() === 'pending');
      console.log(`🎯 Filtered to ${this.leads.length} uncalled leads.`);
    } else {
      console.log(`📂 Loaded all ${this.leads.length} leads.`);
    }

    if (this.leads.length === 0) {
      console.log('🎉 No leads remaining to call!');
      rl.close();
      return;
    }

    while (this.currentIndex < this.leads.length) {
      const currentLead = this.leads[this.currentIndex];
      this.displayLead(currentLead);
      const action = await this.handleInput(currentLead);
      if (action === 'QUIT') break;
    }

    await this.save();
    console.log('\n' + '='.repeat(68));
    console.log('   📊 CALLING SESSION COMPLETED');
    console.log('='.repeat(68));
    console.log(`   Total Leads Viewed : ${this.stats.viewed}`);
    console.log(`   Calls Logged       : ${this.stats.called}`);
    console.log(`   Interested / Demos : ${this.stats.interested}`);
    console.log(`   Callbacks Scheduled: ${this.stats.callback}`);
    console.log(`   Rejections         : ${this.stats.rejected}`);
    console.log(`   No Answers         : ${this.stats.noAnswer}`);
    console.log('   All data saved safely to Excel.');
    console.log('='.repeat(68) + '\n');
    rl.close();
  }
}

async function main() {
  const targetFile = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FILE;
  const caller = new LeadCaller(targetFile);

  process.on('SIGINT', async () => {
    console.log('\n\n🛑 [SESSION INTERRUPTED]');
    console.log('✅ Don\'t worry! All leads updated before this moment are ALREADY saved in Excel.');
    try { await caller.save(); } catch (_) {}
    process.exit(0);
  });

  try {
    await caller.init();
    await caller.run();
  } catch (err) {
    console.error('Fatal error:', err.message);
    rl.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = LeadCaller;
