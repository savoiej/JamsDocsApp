-- The SITREP Client App saves under client/ in the documents table; its admin area
-- (client/admin/) is admin-only, like Netline's and Jams Operations'.
create or replace function private.is_admin_path(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p like 'netline/v1/admin/%' or p like 'jamsos/netline/v1/admin/%' or p like 'client/admin/%'
$$;
