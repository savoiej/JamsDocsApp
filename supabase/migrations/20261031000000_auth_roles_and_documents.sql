-- JamsNET on Supabase: user roles (admin / user) and the app's saved data.
-- The app stores its records as JSON documents addressed by path (e.g. meta/clients,
-- projects/pj1, netline/v1/projects/nw1/devices/de1). One table holds them all.

-- Roles ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'user');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'user',
  active boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per signed-up person. role decides admin access; active must be true (set by an admin) before they can see any data.';

-- private helpers live outside the exposed schema
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and active
  );
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
  );
$$;
revoke all on function private.is_member() from public;
grant execute on function private.is_member() to authenticated;

-- every new account gets a profile; the very first account becomes the admin
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- the first account is the admin and is active; everyone after waits for an admin to let them in
  if exists (select 1 from public.profiles) then
    insert into public.profiles (id, email, full_name, role, active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'user', false);
  else
    insert into public.profiles (id, email, full_name, role, active)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'admin', true);
  end if;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- only admins change roles, and the last admin can't be demoted
create or replace function private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role or new.active is distinct from old.active then
    if not private.is_admin() then
      raise exception 'Only an admin can change roles or access';
    end if;
    if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
       and (select count(*) from public.profiles where role = 'admin' and active) <= 1 then
      raise exception 'There must be at least one active admin';
    end if;
  end if;
  new.id := old.id;
  new.email := old.email;
  return new;
end;
$$;
revoke all on function private.guard_role_change() from public;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function private.guard_role_change();

alter table public.profiles enable row level security;

create policy "People see their own profile; team members see the team"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select private.is_member()));

create policy "People edit their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Admins edit any profile"
  on public.profiles for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

grant select, update (full_name, role, active) on public.profiles to authenticated;

-- App data --------------------------------------------------------------------
create table public.documents (
  path text primary key,
  collection text not null,
  doc_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid()
);
comment on table public.documents is 'JamsNET records, one JSON document per path. Admin-only data lives under netline/v1/admin/.';
create index documents_collection_idx on public.documents (collection);
create index documents_updated_by_idx on public.documents (updated_by);

create or replace function private.touch_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
create trigger documents_touch
  before insert or update on public.documents
  for each row execute function private.touch_document();

alter table public.documents enable row level security;

create policy "Team reads app data; admin data only for admins"
  on public.documents for select to authenticated
  using ((select private.is_member()) and (path not like 'netline/v1/admin/%' or (select private.is_admin())));

create policy "Team adds app data; admin data only for admins"
  on public.documents for insert to authenticated
  with check ((select private.is_member()) and (path not like 'netline/v1/admin/%' or (select private.is_admin())));

create policy "Team changes app data; admin data only for admins"
  on public.documents for update to authenticated
  using ((select private.is_member()) and (path not like 'netline/v1/admin/%' or (select private.is_admin())))
  with check ((select private.is_member()) and (path not like 'netline/v1/admin/%' or (select private.is_admin())));

create policy "Team removes app data; admin data only for admins"
  on public.documents for delete to authenticated
  using ((select private.is_member()) and (path not like 'netline/v1/admin/%' or (select private.is_admin())));

grant select, insert, update, delete on public.documents to authenticated;

-- live updates for open windows
alter table public.documents replica identity full;
alter publication supabase_realtime add table public.documents;

-- Files (photos, floor plans, spec sheets) -------------------------------------
insert into storage.buckets (id, name, public) values ('assets', 'assets', false)
on conflict (id) do nothing;

create policy "Team reads files" on storage.objects for select to authenticated
  using (bucket_id = 'assets' and (select private.is_member()));
create policy "Team uploads files" on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and (select private.is_member()));
create policy "Team replaces files" on storage.objects for update to authenticated
  using (bucket_id = 'assets' and (select private.is_member())) with check (bucket_id = 'assets' and (select private.is_member()));
create policy "Team removes files" on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and (select private.is_member()));
