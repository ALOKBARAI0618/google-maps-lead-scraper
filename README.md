# 📍 Google Maps Lead Scraper & Terminal CRM Calling Assistant

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v16%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Playwright-v1.52%2B-2EAD33?style=for-the-badge&logo=playwright&logoColor=white" alt="Playwright" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/Cost-100%25%20Free-orange?style=for-the-badge" alt="Free" />
</p>

<p align="center">
  <strong>The open-source alternative to paid lead scrapers (Outscraper, Apify, Apollo).</strong><br>
  Extract thousands of local B2B leads directly from Google Maps with emails, websites, and phone numbers — then manage cold calls with an ultra-fast, 1-key terminal CRM assistant.
</p>

---

## 💡 Why This Tool?

| Feature | Paid Scrapers ($50–$200/mo) | This Free Tool |
| :--- | :---: | :---: |
| **Monthly Subscription** | $50 – $200 / month | **$0 (100% Free)** |
| **Google Cloud API Key** | Required or Metered | **Not Required** |
| **Email Discovery** | Paid Add-on | **Included (Automatic)** |
| **Lead Categorization** | Basic / None | **Hot Targets (Phone ✅, Site ❌)** |
| **Built-in Calling Co-Pilot** | None (Export to CRM) | **Instant 1-Key Terminal Assistant** |
| **Data Privacy** | Stored on Cloud | **100% Local on your machine** |

---

## ⚡ Features

1. **Autonomous Google Maps Scraper**:
   - Scrapes business name, category, rating, reviews count, phone numbers, full address, and website.
   - Built-in human-like scroll pacing and randomized pauses to prevent rate-limits and blocks.
2. **Deep Email Extractor**:
   - Automatically visits the business website and extracts contact email addresses (`info@`, `contact@`, etc.).
3. **Smart Lead Categorization**:
   - `🟢 HOT CALL TARGET`: Verified phone number, but NO active website (the #1 best client prospect for web agencies!).
   - `🔵 HAS REAL WEBSITE`: Has phone number and live website.
   - `🔴 NO PHONE`: Unreachable business.
4. **Instant 1-Key Calling Assistant (`lead-caller.js`)**:
   - Super-fast telecalling co-pilot. Update call statuses directly in Excel with single keystrokes without touching the mouse.
   - Auto-saves to disk on every single action — zero data loss even if the terminal is closed.
5. **Automatic Safety Backups**:
   - Generates `.BACKUP.xlsx` automatically before modifying any file.

---

## 🚀 Quick Start Guide

### 1. Clone the Repository
```bash
git clone https://github.com/ALOKBARAI0618/google-maps-lead-scraper.git
cd google-maps-lead-scraper
```

### 2. Install Dependencies & Playwright Browser
```bash
npm install
npm run install-browser
```

Setup is complete! You are ready to scrape and call.

---

## 🔎 How to Scrape Leads

Run `scraper.js` with your search keyword and city:

```bash
# 1. Quick search by keyword and city
node scraper.js "interior designers mumbai"

# 2. Search specific category with city flag
node scraper.js "dentists" --city mumbai

# 3. Target specific neighborhoods / localities
node scraper.js "cafes" --city mumbai --areas "Andheri,Bandra,Juhu"

# 4. Visible browser mode (headed) for monitoring
node scraper.js "plumbers delhi" --headed

# 5. Limit lead count
node scraper.js "marketing agency bangalore" --limit 50
```

### Scraper Command Options

| Flag | Description | Example |
| :--- | :--- | :--- |
| `[query]` | Search keyword | `"digital marketing mumbai"` |
| `--city <name>` | Target city name | `--city mumbai` |
| `--areas <list>` | Comma-separated area list | `--areas "Andheri,Bandra"` |
| `--headed` | Show the browser window | `--headed` |
| `--limit <num>` | Stop after N leads | `--limit 100` |
| `--output <path>` | Custom export path | `--output ./output/leads.xlsx` |

---

## 📞 Terminal CRM & Calling Assistant (`lead-caller.js`)

When calling leads, updating Excel cells manually is slow. The calling assistant displays each lead in your terminal and saves updates instantly with single keystrokes:

```bash
# Launch with sample leads or your exported sheet
npm run call
# Or target a specific Excel file:
node lead-caller.js "sample-leads.xlsx"
```

### Instant 1-Key Shortcuts (Auto-Saves & Jumps to Next Lead)

| Key | Action | Result in Excel |
| :---: | :--- | :--- |
| **`[1]`** | **Call Done** | Sets **`Call = Yes`**, saves, and jumps to next lead! |
| **`[2]`** | **Do Not Call** | Sets **`Not Call = Yes`**, saves, and jumps to next lead! |
| **`[3]`** | **Asking for Details** | Sets **`Call = Yes`** & **`Asking for Detailed = Yes`**, prompts summary, saves & next lead! |
| **`[4]`** | **Directly Rejected** | Sets **`Call = Yes`**, **`Directly Rejected = Yes`**, **`Not Call = Yes`**, saves & next lead! |
| **`[5]`** | **Set Follow-Up Date** | Quick presets (`1: Tomorrow`, `2: In 2 Days`, `3: Next Monday`, or custom), saves & next! |
| **`[6]`** | **What was discussed?** | Prompts for call summary (with 3 quick presets or custom text), saves & next! |
| **`[7]`** | **Add Notes** | Appends a timestamped note, saves & next! |
| **`[0]`** or **`[X]`** | **No Answer / Ringing** | Sets **`Call = Pending`**, notes "No Answer", saves & jumps to next lead! |
| **`[W]`** | **WhatsApp Link** | Generates a direct click-to-chat WhatsApp link with a pre-filled business message. |

### Navigation:
- **`[Enter]`**: Skip to next lead without changes.
- **`[P]`**: Return to previous lead.
- **`[J]`**: Jump to specific lead number.
- **`[Q]`**: Save all progress and exit.

---

## 📑 Excel In-App Shortcuts (VBA Macro)

If you prefer updating cells directly inside Microsoft Excel:
1. Open your Excel workbook.
2. Press **`Alt + F11`** ➔ Click **`File`** ➔ **`Import File...`** ➔ Select `QuickCRM_Shortcuts.bas`.
3. Press **`Alt + F8`**, select `Setup_CRM_Shortcuts`, and click **`Run`**.

**In-Excel Hotkeys:**
- `Ctrl + Shift + C` ➔ `Call = "Yes"`
- `Ctrl + Shift + N` ➔ `Not Call = "Yes"`
- `Ctrl + Shift + D` ➔ `Asking for Detailed = "Yes"`
- `Ctrl + Shift + R` ➔ `Directly Rejected = "Yes"`
- `Ctrl + Shift + F` ➔ Popup for Follow-up Date
- `Ctrl + Shift + W` ➔ Popup for "What was discussed on call?"
- `Ctrl + Shift + O` ➔ Popup to append a timestamped Note

---

## 📊 Standard CRM Columns in Output Workbooks

Every exported Excel file is formatted with:
1. `S.No`
2. `Name`
3. `Category`
4. `Rating`
5. `Reviews`
6. `Email`
7. `Google Maps URL`
8. `Area`
9. `Phone 1`
10. `Website`
11. `Call`
12. `Not Call`
13. `Asking for Detailed`
14. `Directly Rejected`
15. `Follow Up Date`
16. `What was discussed on call?`
17. `Notes`

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/ALOKBARAI0618/google-maps-lead-scraper/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## ⭐ Show Your Support

If this project saved you money or helped you land clients, please give it a **Star ⭐ on GitHub**! It helps others discover this free tool.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
