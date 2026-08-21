-- Run once in the Supabase SQL editor to stream new simulator readings.
-- The frontend subscribes with the anon/publishable key, so sensor_data must
-- also have an appropriate SELECT policy when Row Level Security is enabled.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sensor_data'
  ) then
    alter publication supabase_realtime add table public.sensor_data;
  end if;
end
$$;
