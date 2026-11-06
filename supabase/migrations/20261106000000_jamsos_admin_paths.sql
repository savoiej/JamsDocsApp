-- JamsOS saves under jamsos/ in the same documents table. Its admin-only area
-- (jamsos/netline/v1/admin/) gets the same protection as Netline's.
create or replace function private.is_admin_path(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p like 'netline/v1/admin/%' or p like 'jamsos/netline/v1/admin/%'
$$;
revoke all on function private.is_admin_path(text) from public;
grant execute on function private.is_admin_path(text) to authenticated;

drop policy "Team reads app data; admin data only for admins" on public.documents;
drop policy "Team adds app data; admin data only for admins" on public.documents;
drop policy "Team changes app data; admin data only for admins" on public.documents;
drop policy "Team removes app data; admin data only for admins" on public.documents;

create policy "Team reads app data; admin data only for admins"
  on public.documents for select to authenticated
  using ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin())));

create policy "Team adds app data; admin data only for admins"
  on public.documents for insert to authenticated
  with check ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin())));

create policy "Team changes app data; admin data only for admins"
  on public.documents for update to authenticated
  using ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin())))
  with check ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin())));

create policy "Team removes app data; admin data only for admins"
  on public.documents for delete to authenticated
  using ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin())));
