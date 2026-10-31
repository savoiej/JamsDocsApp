# JamsNET web app (Next.js + Supabase)

JamsNET running as a Next.js site, with Supabase for sign-in, roles and all saved data.

## Run it locally

```bash
cd web
npm install
npm run dev        # http://localhost:3001
```

`.env` holds the Supabase project URL and publishable key (see `.env.example`). It is not committed.

**First sign-in:** go to `/signup`. The **first account becomes the admin** and is active straight away. Everyone after that signs up, confirms their email, and waits until an admin approves them on **Team & access** (`/admin/users`).

In Supabase → Authentication → URL Configuration, set the Site URL to where the app runs and add `http://localhost:3001/**` to Redirect URLs, so confirmation emails come back here.

## Roles

| | Admin | User |
|---|---|---|
| Use JamsNET (clients, projects, contracts, time, network docs…) | ✓ | ✓ |
| Network docs admin console (plans, customer accounts) | ✓ | — |
| Team & access: approve people, turn access off, make admins | ✓ | — |

New accounts can't see any data until an admin approves them. The database enforces all of this with row-level security, not just the screens; there is always at least one active admin.

## How it fits together

- `app/login`, `app/signup`, `app/auth/*` — sign-in with email and password (`@supabase/ssr`, cookies).
- `proxy.ts` — refreshes the session on every request and sends signed-out visitors to `/login`.
- `app/app` — the JamsNET app. `jamsnet/index.html` is the app page; `app/api/jamsnet` serves it only to approved members.
- `lib/jams-bridge.ts` — JamsNET was built for the claude.ai runtime (`window.claude.use(...)`). The bridge provides the same `db`, `user`, `assets` and `downloads` interfaces on Supabase:
  - **db** → `public.documents`, one JSON document per path (`meta/clients`, `projects/<id>`, `netline/v1/projects/<id>/devices/<id>`…), live across windows through Realtime.
  - **assets** → private Storage bucket `assets`, served at `/_blob/<id>` (`app/api/blob/[id]` signs a short-lived link).
  - **user** → the signed-in profile; admins are the app's "owner".
- `../supabase/migrations/` — tables, roles, policies and the Storage bucket.

## Updating the app page

After changing `apps/jamsnet/index.html` at the repo root, copy it into `web/jamsnet/index.html`.

## Checks

```bash
npm run lint
npm run build
tests/run-bridge-test.sh   # JamsNET against a stand-in Supabase, no network needed
```
