# Deploying the scraper to a Raspberry Pi 4B (8GB)

The code is portable — every path is `path.join(__dirname, ...)` and the browser
is resolved by Playwright, not hardcoded. Nothing needed rewriting. This is a
packaging job.

## Files added

| File | Purpose |
| --- | --- |
| `Dockerfile` | arm64 image; installs Chromium with its system dependencies |
| `docker-compose.yml` | Runs the service; mounts state as host volumes |
| `.dockerignore` | Keeps `output/`, state files, and credentials out of the image |
| `Jenkinsfile` | Rebuild + redeploy pipeline |
| `pi-setup.sh` | One-time host setup so volume mounts have real targets |

## Why the volume mounts matter

`campaign-progress.json`, `campaign-state.json`, `leads.db`, and `output/` are
bind-mounted from the host. This is deliberate, not tidiness:

- A `docker compose build` after a code change cannot wipe your DONE badges or
  campaign progress.
- Without an existing target, Docker **creates a directory** for a missing bind
  mount. `campaign-state.json` as a directory makes the resume path crash with a
  confusing ENOTDIR. `pi-setup.sh` creates the real files first.
- The image stays ~60MB instead of carrying 20MB of scraped data.

## Steps on the Pi

```bash
git clone <repo> lead-scraper && cd lead-scraper
bash pi-setup.sh
# Put your Google service-account JSON here:
nano gsheet-key.json
docker compose up -d --build
```

Then open `http://<pi-ip>:3000`.

## Credentials — read this before the first build

The Google private key used to be embedded in `gsheet-uploader.js`. It now reads
from, in order:

1. `GSHEET_KEY_FILE` — a path to a service-account JSON file
2. `GSHEET_KEY_JSON` — the raw JSON as a string
3. the embedded key (unchanged, so your PC keeps working with zero config)

The compose file mounts `gsheet-key.json` as a Docker **secret**, so the key is
never baked into an image layer or committed to the repo. The embedded key is
still in git history — **rotate it in GCP** if the repo is ever shared.

To use a second spreadsheet on the Pi instead of sharing the PC's:

```yaml
environment:
  GSHEET_SPREADSHEET_ID: <your-second-spreadsheet-id>
```

## Do not sync from two machines

`appendLeadsToSheet` dedupes by reading the tab, then appending. With two writers
on one sheet, that check is a **race**: both read the same tab state, both append,
and you get duplicate rows or a quota spike that backs off for minutes.

Pick one syncer. Options:
- The Pi syncs; the PC's `output/` is local-only, or
- The Pi uses its own spreadsheet via `GSHEET_SPREADSHEET_ID`.

## What to expect on a Pi 4B

- Memory: the largest single query measured **28k rows** in one workbook, peaked
  well under 2GB. 8GB is comfortable; `mem_limit: 3.5g` leaves room for the OS
  and Jenkins.
- Speed: budget **~2x your desktop's 3.8 min/query** — roughly 7–8 min/city.
  A 390-city run is about 2 days, not 24 hours.
- `shm_size: 2gb` because Chromium on a 64MB `/dev/shm` stutters badly on long
  scroll sessions, even with `--disable-dev-shm-usage` already set in the code.

## Deploying a code change

```
Jenkins → build (REBUILD checked) → deploy
```

Or by hand: `docker compose up -d --build`. The container is recreated, but
campaign state survives because it is on the host.

## When a city stalls

The `page.goto` timeout bug that wedged the queue for ~3 hours on Edmond is
fixed — the error path now closes the browser and force-exits (raced against a
5s timeout so a wedged close cannot reintroduce the stall). If you ever see an
old build stall, the diagnosis is unchanged: the output `.xlsx` and the log are
both >25 min stale while a `node scraper.js` child sits at near-zero CPU. Kill
the **child**, not the server.

---

# Email marketing tool

Runs from your PC — it only reads leads, so there is no write contention with
the Pi.

## Why an SMTP relay is mandatory

Sending from a residential IP on port 25 puts you on the Spamhaus PBL within
minutes. Configure Mailgun, SendGrid, Amazon SES, or Postmark and point the tool
at it. The relay also supplies bounce handling, which protects your sender
reputation.

## First run

```bash
node email-marketing.js --list
```

Creates `email-config.json` from the template and exits. Fill in:

```jsonc
{
  "smtp": { "host": "smtp.mailgun.org", "port": 587, "user": "...", "pass": "..." },
  "from": { "name": "Your Name", "address": "you@yourdomain.com" },
  "business_address": "Your Business, 123 Main St, City, ST 12345",  // CAN-SPAM
  "unsubscribe_base_url": "http://localhost:3000"
}
```

Then:

```bash
node email-marketing.js --list                    # see the sendable list
node email-marketing.js --dry-run                 # render, don't send
node email-marketing.js --dry-run --limit 10      # a few samples
node email-marketing.js --send --limit 50         # small live test first
node email-marketing.js --send                    # the whole list
```

## What the list actually contains

Measured against the current `output/`:

```
98,091 total rows
 6,630 with an email at all
 5,529 unique emails
 3,832 syntax + not placeholder/free domain
 3,832 not already unsubscribed/bounced
 3,832 not already sent
```

So the sendable list is **~3,800**, not 98,000. The pipeline reports each stage
so a bad scrape or a mis-set filter shows up as an unexpected drop rather than a
mysterious low send count.

Filtering choices and why:
- **Role addresses are kept.** `info@`, `contact@`, `events@` are the inboxes a
  restaurant or plumber actually reads. An earlier draft blocked them and cut the
  list from 3,821 to 1,605 for no good reason. They are reported separately
  (2,375 role vs 1,457 direct) so you can decide per campaign.
- **Free webmail is blocked.** A scraped `gmail.com` address is almost always the
  owner's personal account, and cold-marketing those is what generates the spam
  complaints that wreck reputation.
- **Placeholders are blocked.** `your@email.com` genuinely appears in scraped
  rows when a business never filled in its contact field.

## Compliance

CAN-SPAM (US recipients) requires four things, and all are in the tool:
1. A working unsubscribe link in every email
2. A physical postal address in the body
3. Opt-outs recorded immediately and never re-sent
4. Accurate From/Subject

The unsubscribe link is HMAC-signed per address, so it cannot be forged to
remove someone else. Verify with `node test-email-tool.js`.

Recipients in the EU/UK fall under GDPR, which is far stricter on scraped
address cold email — review that before sending outside the US.

## Files written

- `email-config.json` — credentials and copy
- `email-suppression.json` — unsubscribes, bounces, manual exclusions, with a
  recorded reason and timestamp for each
- `email-sent-log.json` — per-email send record, so a re-run is a no-op

## Tests

```bash
node test-email-tool.js      # unsubscribe token forgery + blocklist
node test-greeting.js        # greeting heuristic on real business names
```
