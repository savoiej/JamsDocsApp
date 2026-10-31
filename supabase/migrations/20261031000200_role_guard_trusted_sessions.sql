-- Let trusted sessions (the Supabase SQL editor, the service role) change roles and approve people,
-- e.g. to recover access. Signed-in app users still need to be an active admin.
create or replace function private.guard_role_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare app_user boolean := coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon');
begin
  if new.role is distinct from old.role or new.active is distinct from old.active then
    if app_user and not private.is_admin() then
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
