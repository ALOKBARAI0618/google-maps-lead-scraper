# Email Campaign Tool — standalone hand-off

Run the email sender without the scraper.

## What it shares with the main app (no drift)
- `email-core.js` — cleaning + template selection + `sheetStatuses` filter
- `email-sheet.js` — Google Sheets auth + read/write Status col G
- `email-templates.json` — per-category templates
- `output/*.xlsx` — leads source (any files there are read)
- `email-config.json`, `email-suppression.json`, `email-sent-log.json`

## Setup

```bash
npm install   # from repo root (needs express, googleapis, nodemailer, exceljs)

# Google Sheet — one of:
# env  GSHEET_SPREADSHEET_ID=1heGxOHFJ-...
# env  GSHEET_KEY_FILE=/path/to/service-account.json
# env  GSHEET_KEY_JSON='{"client_email":...,"private_key":...}'
# or it falls back to the embedded SERVICE_ACCOUNT_KEY in gsheet-uploader.js
```

Config: edit `email-config.json` at repo root:

```jsonc
{
  "smtp": { "host": "mail.cotechagency.com", "port": 587, "user": "kaira@cotechagency.com", "pass": "..." },
  "from": { "name": "Kaira", "address": "kaira@cotechagency.com" },
  "reply_to": "kaira@cotechagency.com",
  "unsubscribe_base_url": "https://your-public-host:3000", // NOT localhost before bulk — also used as pixel base; see below
  "business_address": "2nd Floor, Cotech Agency Building, ...",
  "subject": "Quick question about {{category}} work in {{area}}",
  "per_hour": 200, "per_batch": 50, "batch_pause_seconds": 30,
  "sender_name": "Kaira",
  "campaign_name": "2026-09-30" // default today; controls dedupe key
  // optional, for pixel + IMAP:
  // "pixel_base_url": "https://your-public-host:3000", // overrides unsubscribe_base_url for pixel only
  // "imap": { "host":"mail.cotechagency.com","port":993,"secure":true,"user":"kaira@cotechagency.com","pass":"...","mailbox":"INBOX","poll_seconds":180 }
}
```

## Run

```bash
# from repo root — serves on 3003 (override with EMAIL_TOOL_PORT)
EMAIL_TOOL_PORT=3003 node email-campaign-tool/server.js
# open http://localhost:3003
```

Port: `EMAIL_TOOL_PORT=3003` (default 3003; 3001 is occupied by TaskFlow on this machine). Main scraper stays on 3000.

## UI — what each control does

- **Limit / Mode** — how many to send this click; Dry run = no SMTP.
- **Resend** — when checked, ignores `email-sent-log.json` for this campaign day.
- **Use Google Sheet Status** — when on (default), emails whose current Sheet Status (col G) is `DELIVERED` (case-insensitive) are excluded. Empty/UNDELIVERED/FAILED are still mailable.
- **Write DELIVERED to Sheet** — when on, each successful SMTP send does a `batchUpdate G[row]=DELIVERED` in the tab where that email was found. This is how “what’s left” stays correct when you hand the Sheet to someone else.
- **Templates (per category)** — category dropdown populated from `email-templates.json`. Subject / Body / Body HTML. Tokens: `{{sender_name}} {{greeting}} {{name}} {{first_name}} {{category}} {{area}} {{website}} {{unsubscribe_url}} {{business_address}}`. Save writes to disk; next Preview/Run uses it immediately per that category. No scraper restart needed.

## API (same semantics as main app’s /email/*)

- `GET  /api/overview?resend=1&sheet=0|1` — counts + preview + smtp verify + sheet health + template list + `stats`
- `GET  /api/preview?limit=5&resend=1&sheet=0|1` — each lead includes `pixelUrl` when a public base URL is set
- `POST /api/run` NDJSON — body `{mode:"dry"|"send", limit, resend, sheet:"0"|"1", writeSheet}`
- `GET  /api/stats` — `{ delivered, bounced, opened, openRate, replied, replyRate, byCategory, recentOpens, recentReplies, imap }` from `email-events.json`
- `GET  /api/events?q=&limit=&offset=` + `GET /api/export/csv` — dump / filter event store
- `POST /api/imap/poll` / `GET /api/imap/status` — on-demand IMAP + last poll state
- `GET  /t/open?e=<base64url>&t=<hmac>` + `GET /o.gif` — 1x1 pixel (self-hosted, same on :3000 as `/email/*`)
- `GET  /api/templates` / `GET /api/templates/:category` / `PUT /api/templates/:category` / `DELETE /api/templates/:category`
- `GET  /api/config` (pass redacted) / `GET /health`

## “What’s left to send” — exact rule

```
unsent = pass syntax
       ∧ not HARD_BLOCK_LOCAL / placeholder / bad domain
       ∧ local part not empty
       ∧ not suppressed:  suppressed = unsubscribed[email] ∨ bounced[email] ∨ manual.includes(email)
       ∧ Status != DELIVERED   (Status from Sheet Map(lowerEmail -> status); only exact "delivered" case-insensitive is excluded)
       ∧ not already sent in this campaign:  !(sentLog[lowerEmail].campaign === todayUnlessCampaignName)  (unless Resend)
       ∧ deduped by lower email across all xlsx files
       ∧ lead counted once; role split is display-only
```

Appending new rows: if you add 50 new Restaurants rows with empty Status, they satisfy `Status != DELIVERED` and appear in `sendable` on next Refresh (no code change). Sending them with `writeSheet: true` flips those 50 rows to `DELIVERED` so a second Refresh excludes them.

## Handing off to someone else

Give them: `output/*.xlsx` (or at least the latest), `email-config.json`, `email-templates.json`, `email-suppression.json`, `email-sent-log.json`, `email-events.json`, `email-core.js`, `email-sheet.js`, `gsheet-uploader.js`, `email-marketing-helpers.js`, and `email-campaign-tool/` (server.js + public/). They run `node email-campaign-tool/server.js` — no Playwright/chromium needed for the email tool alone. Google auth still needed if they use Sheet mode; otherwise `sheet=0` works offline.

## Email stats (delivered / bounced / opened / replied)

- Shared store `email-events.json` at repo root — both `:3000` and `:3003` read/write it atomically. `email-imap-state.json` + `.email-imap.lock` are its helpers. Preserve all three on hand-off or stats reset.
- Opens: pixel `GET /t/open?e=<base64url>&t=<hmac>` (and `/o.gif`) — injected as `<img … style="display:none">` before `</div>` in `html` at send time. HMAC is `sha256(email, unsubscribe_secret || smtp.pass)`. Served as `image/gif` `no-store`. Gmail proxy fires once; Apple Mail Privacy may inflate — shown as-is.
- Replies / async bounces: IMAP polling every `imap.poll_seconds` (default 180) + on-demand `POST /api/imap/poll` (or `:3000` `POST /email/imap/poll`). Uses `imapflow` + `mailparser` on `mail.cotechagency.com:993` with same creds as SMTP. File lock so only one of `:3000`/`:3003` polls at a time.

- `pixel_base_url` in `email-config.json` overrides `unsubscribe_base_url` for pixel. Must be a public URL for real recipients — the UI warns when it still contains `localhost`.

## Safety before bulk

- Set `unsubscribe_base_url` to a public URL (the UI warns when it still contains `localhost`).
- Preview first, then dry run, then send 5 real, then bulk.
