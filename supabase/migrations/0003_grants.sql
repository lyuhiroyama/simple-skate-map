-- Data API was created with "automatically expose new tables" off.
-- The Express service_role client talks through PostgREST, so tables
-- need explicit grants.

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on all tables in schema public to postgres, service_role;
grant all on all sequences in schema public to postgres, service_role;
grant all on all routines in schema public to postgres, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

notify pgrst, 'reload schema';
