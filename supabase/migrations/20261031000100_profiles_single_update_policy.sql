-- One update policy on profiles instead of two (performance advisor: multiple permissive policies).
drop policy "People edit their own profile" on public.profiles;
drop policy "Admins edit any profile" on public.profiles;
create policy "People edit their own profile; admins edit any"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()))
  with check ((select auth.uid()) = id or (select private.is_admin()));
