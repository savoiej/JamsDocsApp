-- Online payments recorded by the Stripe webhook (stripepay/<checkout session id>) are money records:
-- staff only, like invoices. The webhook writes them with the server's service key.
create or replace function private.is_money_path(p text)
returns boolean language sql immutable set search_path = ''
as $$
  select p ~ '^(jamsos/|client/)?meta/(invoices|contracts)$'
      or p ~ '^(jamsos/|client/)?netline/v1/projects/[^/]+/invoices/'
      or p ~ '^stripepay/';
$$;
