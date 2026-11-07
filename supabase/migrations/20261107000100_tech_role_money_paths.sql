-- Technicians (role 'tech') can't read or write the money-only records: invoices and service
-- contracts (in every app namespace) and network invoices. The typed copies of those records,
-- plus products (dealer costs), pipeline deals and business settings (rates), are readable
-- by admins and users only. Project and library documents stay shared because techs need the
-- drawings; the app hides prices in them for techs.

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and active and role in ('admin', 'user'));
$$;
revoke all on function private.is_staff() from public;
grant execute on function private.is_staff() to authenticated;

create or replace function private.is_money_path(p text)
returns boolean language sql immutable set search_path = ''
as $$
  select p ~ '^(jamsos/|client/)?meta/(invoices|contracts)$'
      or p ~ '^(jamsos/|client/)?netline/v1/projects/[^/]+/invoices/';
$$;
revoke all on function private.is_money_path(text) from public;
grant execute on function private.is_money_path(text) to authenticated;

drop policy "Team reads app data; admin data only for admins" on public.documents;
drop policy "Team adds app data; admin data only for admins" on public.documents;
drop policy "Team changes app data; admin data only for admins" on public.documents;
drop policy "Team removes app data; admin data only for admins" on public.documents;

create policy "Team reads app data; admin data only for admins"
  on public.documents for select to authenticated
  using ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin()))
         and (not private.is_money_path(path) or (select private.is_staff())));

create policy "Team adds app data; admin data only for admins"
  on public.documents for insert to authenticated
  with check ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin()))
              and (not private.is_money_path(path) or (select private.is_staff())));

create policy "Team changes app data; admin data only for admins"
  on public.documents for update to authenticated
  using ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin()))
         and (not private.is_money_path(path) or (select private.is_staff())))
  with check ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin()))
              and (not private.is_money_path(path) or (select private.is_staff())));

create policy "Team removes app data; admin data only for admins"
  on public.documents for delete to authenticated
  using ((select private.is_member()) and (not private.is_admin_path(path) or (select private.is_admin()))
         and (not private.is_money_path(path) or (select private.is_staff())));

-- typed copies that carry money: staff only (admin-only tables keep their admin rule)
do $$
declare t text;
begin
  foreach t in array array['invoices','invoice_lines','invoice_payments','service_contracts','contract_billing_periods','contract_visits',
                           'net_invoices','net_invoice_lines','pipeline_deals','products','business_settings','service_agreements']
  loop
    if exists (select 1 from private.typed_tables where name = t and not coalesce(admin_only, false)) then
      execute format('drop policy if exists %I on public.%I', 'Team members read this', t);
      execute format('create policy %I on public.%I for select to authenticated using ((select private.is_staff()))', 'Team members read this', t);
    end if;
  end loop;
end $$;
