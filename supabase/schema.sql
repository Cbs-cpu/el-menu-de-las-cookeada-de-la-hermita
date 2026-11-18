-- El menú de cookeadas de la ermita · Conchas para ermitaños
-- Pega este archivo entero en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.

-- ───────── Tablas ─────────
create table if not exists public.spots (
  id          uuid primary key,
  name        text not null check (char_length(name) between 1 and 80),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  rating      int not null default 0 check (rating between 0 and 5),
  notes       text not null default '' check (char_length(notes) <= 5000),
  address     text,
  shell       text not null default 'naranja',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.media (
  id          uuid primary key,
  spot_id     uuid not null references public.spots(id) on delete cascade,
  path        text not null,
  kind        text not null check (kind in ('image', 'video')),
  name        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists media_spot_id_idx on public.media (spot_id);

-- ───────── Permisos: cualquiera con el enlace de la app puede ver y editar ─────────
alter table public.spots enable row level security;
alter table public.media enable row level security;

drop policy if exists "hermita spots" on public.spots;
create policy "hermita spots" on public.spots for all to anon, authenticated using (true) with check (true);

drop policy if exists "hermita media" on public.media;
create policy "hermita media" on public.media for all to anon, authenticated using (true) with check (true);

-- ───────── Tiempo real: avisar a todos los dispositivos de cada cambio ─────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'spots') then
    alter publication supabase_realtime add table public.spots;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'media') then
    alter publication supabase_realtime add table public.media;
  end if;
end $$;

-- ───────── Fotos y vídeos: bucket público de hasta 50 MB por archivo ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hermita media leer" on storage.objects;
create policy "hermita media leer" on storage.objects for select to anon, authenticated using (bucket_id = 'media');

drop policy if exists "hermita media subir" on storage.objects;
create policy "hermita media subir" on storage.objects for insert to anon, authenticated with check (bucket_id = 'media');

drop policy if exists "hermita media borrar" on storage.objects;
create policy "hermita media borrar" on storage.objects for delete to anon, authenticated using (bucket_id = 'media');
