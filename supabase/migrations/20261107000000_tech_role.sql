-- A third role for field technicians: they work on projects, drawings, the library, the
-- field app and the service desk, but don't see money. Added on its own because a new enum
-- value has to be committed before policies can use it.
alter type public.app_role add value if not exists 'tech';
