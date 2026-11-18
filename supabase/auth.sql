-- El menú de cookeadas de la hermita · Login y registro
-- Ejecutar DESPUÉS de schema.sql: Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.

-- Quién puso cada concha
alter table public.spots add column if not exists author text;

-- A partir de ahora solo los usuarios con sesión iniciada ven y editan conchas
drop policy if exists "hermita spots" on public.spots;
create policy "hermita spots" on public.spots for all to authenticated using (true) with check (true);

drop policy if exists "hermita media" on public.media;
create policy "hermita media" on public.media for all to authenticated using (true) with check (true);

-- Subir y borrar fotos y vídeos también requiere sesión
drop policy if exists "hermita media subir" on storage.objects;
create policy "hermita media subir" on storage.objects for insert to authenticated with check (bucket_id = 'media');

drop policy if exists "hermita media borrar" on storage.objects;
create policy "hermita media borrar" on storage.objects for delete to authenticated using (bucket_id = 'media');
