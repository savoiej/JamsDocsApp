-- Microsoft 365 mailboxes connected to the client inbox. Refresh tokens are stored encrypted by the
-- server; no one reads this table through the API (RLS on, no policies, grants removed).
create table if not exists public.inbox_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'm365',
  email text not null,
  name text,
  shared text[] not null default '{}',
  token_enc text not null,
  last_sync timestamptz,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (provider, email)
);
alter table public.inbox_accounts enable row level security;
revoke all on public.inbox_accounts from anon, authenticated;

-- synced mail (inboxmsg/<id>) is office staff only, like the inbox itself
create or replace function private.is_money_path(p text)
returns boolean language sql immutable set search_path = ''
as $$
  select p ~ '^(jamsos/|client/)?meta/(invoices|contracts|inbox)$'
      or p ~ '^(jamsos/|client/)?netline/v1/projects/[^/]+/invoices/'
      or p ~ '^stripe(pay|pm)/'
      or p ~ '^inboxmsg/';
$$;
