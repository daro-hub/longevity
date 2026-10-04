-- Closes the PostgREST exposure every public table has by default:
-- without this, anyone with the project's anon key could read/write
-- rag_chunks via the Supabase REST API. The app never uses that path --
-- it only ever reads/writes this table through a direct Postgres
-- connection authenticated as the table owner (SUPABASE_DB_URL), and the
-- owner role bypasses RLS by default, so this does not change how the
-- app itself behaves. Already applied to the live project directly;
-- this file is here so it's reproducible for a fresh project.

alter table "public"."rag_chunks" enable row level security;

create policy "no_client_access" on "public"."rag_chunks"
  for all
  to anon, authenticated
  using (false);
