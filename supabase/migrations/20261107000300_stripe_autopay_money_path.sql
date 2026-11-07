-- Saved autopay payment methods (stripepm/<contract id>) are staff only, like invoices and payments.
create or replace function private.is_money_path(p text)
returns boolean language sql immutable set search_path = ''
as $$
  select p ~ '^(jamsos/|client/)?meta/(invoices|contracts)$'
      or p ~ '^(jamsos/|client/)?netline/v1/projects/[^/]+/invoices/'
      or p ~ '^stripe(pay|pm)/';
$$;
