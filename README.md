# JamsNET

AV design, proposals, projects, service contracts, time & invoicing and network documentation for **Jams Docs and Designs** — one app, delivered as a single self-contained HTML page published as a claude.ai artifact.

## What's here

| Path | What it is | Published at |
|---|---|---|
| `apps/jamsnet/index.html` | **JamsNET**, the combined app. Network docs run inside it (the Netline code is embedded in a `<script type="text/plain" id="nlsrc">` block and loaded in a frame). | https://claude.ai/artifact/1du4BSTFvnCX4tamvmsKuG |
| `apps/netline/index.html` | **Netline**, the standalone network-documentation app (hosted product, plans and modules per customer). Also the source of the network docs embedded in JamsNET. | https://claude.ai/artifact/HTnSSukvAoNNfVikhxhhqs |
| `apps/jams-docs-and-designs/index.html` | The original AV design app (before JamsNET). | https://claude.ai/artifact/XqWiKrqY6AnbRVYwFpFqmw |
| `site/index.html` | Marketing website for Jams Docs and Designs. | — |
| `assets/logo.png` | Company logo. | — |
| `tests/` | Browser checks (Playwright) for JamsNET. | — |
| `web/` | **JamsNET as a Next.js site on Supabase**: sign-in, admin and user roles, all data in Supabase. See `web/README.md`. | — |
| `supabase/migrations/` | Database tables, roles, row-level security and file storage for `web/`. | — |

## Data

The Next.js site (`web/`) saves everything to Supabase. The claude.ai artifacts each save to its artifact's own database when opened on claude.ai, or to the browser when opened as a plain file. JamsNET keeps network docs under `netline/v1/…` so they never mix with projects, clients and invoices.

## Running the checks

Needs Python 3 and Playwright with Chromium (`pip install playwright && playwright install chromium`).

```bash
python3 tests/acts.py     # every button's action has a handler (openSpec is an intentional plain link)
python3 tests/navt.py     # every sidebar link opens the right page
python3 tests/crawl.py    # clicks through every JamsNET page looking for errors
python3 tests/crawl2.py   # same for every network docs page
```

The checks open the page offline and stand in for the claude.ai database with an in-memory one (`tests/harness.py`).

## Updating network docs inside JamsNET

Edit `apps/netline/index.html`, then copy it into JamsNET's `nlsrc` block with `Netline` renamed to `JamsNET` and `<script`, `</script` and `<!--` escaped as `<\script`, `<\/script`, `<\!--`.

Contact: Jamie@jamsdocsanddesigns.com · 808-636-8720
