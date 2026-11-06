# SITREP

## Live sites (Vercel)

| Site | Address | Built from |
|---|---|---|
| Jams Docs and Designs business website | https://www.jamsdocsanddesigns.com (jamsdocsanddesigns.com forwards here; also jams-docs-and-designs.vercel.app) | `site/` |
| SITREP app (sign-in, Supabase) | https://app.jamsdocsanddesigns.com (also jams-docs-app.vercel.app) | `web/` |

Each push to `main` redeploys only the site whose folder changed. DNS is at GoDaddy: `www` and `app` are CNAMEs to `cname.vercel-dns.com`, and the bare domain uses GoDaddy forwarding to `https://www.jamsdocsanddesigns.com`. Leave the MX and TXT records alone (email).


AV design, proposals, projects, service contracts, time & invoicing and network documentation for **Jams Docs and Designs** — one app, delivered as a single self-contained HTML page published as a claude.ai artifact.

## What's here

| Path | What it is | Published at |
|---|---|---|
| `apps/jamsnet/index.html` | **SITREP**, the combined app. Network docs run inside it (the SITREP code is embedded in a `<script type="text/plain" id="nlsrc">` block and loaded in a frame). | https://claude.ai/artifact/1du4BSTFvnCX4tamvmsKuG |
| `apps/netline/index.html` | **SITREP**, the standalone network-documentation app (hosted product, plans and modules per customer). Also the source of the network docs embedded in SITREP. | https://claude.ai/artifact/HTnSSukvAoNNfVikhxhhqs |
| `apps/jams-docs-and-designs/index.html` | The original AV design app (before SITREP). | https://claude.ai/artifact/XqWiKrqY6AnbRVYwFpFqmw |
| `site/index.html` | Marketing website for Jams Docs and Designs. | — |
| `assets/logo.png` | Company logo. | — |
| `tests/` | Browser checks (Playwright) for SITREP. | — |
| `web/` | **SITREP as a Next.js site on Supabase**: sign-in, admin and user roles, all data in Supabase. See `web/README.md`. | — |
| `supabase/migrations/` | Database tables, roles, row-level security and file storage for `web/`. | — |
| `supabase/tools/` | `gen_typed_tables.py` builds the typed-tables migration (one table per record type, one column per field). | — |

## Data

The Next.js site (`web/`) saves everything to Supabase. The claude.ai artifacts each save to its artifact's own database when opened on claude.ai, or to the browser when opened as a plain file. SITREP keeps network docs under `netline/v1/…` so they never mix with projects, clients and invoices.

## Running the checks

Needs Python 3 and Playwright with Chromium (`pip install playwright && playwright install chromium`).

```bash
python3 tests/acts.py     # every button's action has a handler (openSpec is an intentional plain link)
python3 tests/navt.py     # every sidebar link opens the right page
python3 tests/crawl.py    # clicks through every SITREP page looking for errors
python3 tests/crawl2.py   # same for every network docs page
```

The checks open the page offline and stand in for the claude.ai database with an in-memory one (`tests/harness.py`).

## Updating network docs inside SITREP

Edit `apps/netline/index.html`, then copy it into SITREP's `nlsrc` block with `SITREP` renamed to `SITREP` and `<script`, `</script` and `<!--` escaped as `<\script`, `<\/script`, `<\!--`.

Contact: Jamie@jamsdocsanddesigns.com · 808-636-8720

## Typed tables in Supabase

Every kind of record the app saves also lands in its own table with one column per field: `clients`, `invoices`, `invoice_lines`, `projects`, `time_entries`, `service_contracts`, `net_devices`, `net_device_ports`, `net_tickets` and so on (56 tables). Use them for SQL queries, reports and exports.

- The app still saves to `public.documents`; a trigger copies each save into the typed tables, so they are always current. They are read-only. Change data in the app.
- Fields without a column of their own are kept in each row's `extra` column.
- Child lists (invoice lines, device ports, contract visits…) get their own tables linked by `invoice_id`, `device_id`, `contract_id` and so on. Network tables carry `network_id`.
- If a record can't be copied, the save still succeeds and the problem is logged in `private.sync_errors`.
- Same access rules as the app: approved team members can read them; plan and customer-account tables are admin-only.
- To add a field, edit `supabase/tools/gen_typed_tables.py`, regenerate with `python3 supabase/tools/gen_typed_tables.py <store.json> > supabase/migrations/<new>.sql`, and apply.

