-- The client inbox (meta/inbox) holds client conversations: office staff only, like invoices.
-- Technicians never load it; this keeps the database from serving it to them either.
create or replace function private.is_money_path(p text)
returns boolean language sql immutable set search_path = ''
as $$
  select p ~ '^(jamsos/|client/)?meta/(invoices|contracts|inbox)$'
      or p ~ '^(jamsos/|client/)?netline/v1/projects/[^/]+/invoices/'
      or p ~ '^stripe(pay|pm)/';
$$;
