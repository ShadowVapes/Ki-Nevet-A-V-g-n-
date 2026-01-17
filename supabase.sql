-- Supabase SQL (SQL Editorben futtasd)

-- 1) Tabla
create table if not exists public.ludo_rooms (
  code text primary key,
  state jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- 2) DEMO / gyors megoldas: RLS OFF (ezzel biztosan tudsz szobat letrehozni anon key-vel)
alter table public.ludo_rooms disable row level security;

-- 3) Realtime (Database -> Replication -> ludo_rooms bekapcsol)

-- Ha inkabb RLS-t akarsz, akkor kommenteld ki a fenti disable-t, es hasznald ezt:
-- alter table public.ludo_rooms enable row level security;
--
-- create policy "anon_select" on public.ludo_rooms
--   for select to anon
--   using (true);
--
-- create policy "anon_insert" on public.ludo_rooms
--   for insert to anon
--   with check (true);
--
-- create policy "anon_update" on public.ludo_rooms
--   for update to anon
--   using (true)
--   with check (true);
