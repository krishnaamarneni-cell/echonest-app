-- Shared clock for listen-along sync. Run ONCE in the Supabase SQL editor.
--
-- Each device estimates its offset from the database server's clock by calling
-- this, so position math uses ONE shared timeline instead of each device's own
-- (possibly skewed) clock. Removes the biggest source of listen-along drift.

create or replace function public.server_now_ms()
returns bigint
language sql
stable
as $$ select (extract(epoch from now()) * 1000)::bigint $$;

grant execute on function public.server_now_ms() to anon, authenticated;
