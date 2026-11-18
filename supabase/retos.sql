-- El menú de cookeadas de la ermita · Reseñas, medias estrellas, características, retos diarios y ranking
-- Ejecutar DESPUÉS de schema.sql, auth.sql y sacred.sql: Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.

-- ───────── Medias estrellas y características ─────────
alter table public.spots alter column rating type numeric(2,1) using rating::numeric(2,1);
alter table public.spots add column if not exists tags text[] not null default '{}';

-- ───────── Reseñas: una por persona y concha ─────────
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  spot_id     uuid not null references public.spots(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  username    text not null default coalesce(auth.jwt() -> 'user_metadata' ->> 'username', ''),
  rating      numeric(2,1) not null check (rating between 0.5 and 5 and rating * 2 = floor(rating * 2)),
  body        text not null default '' check (char_length(body) <= 3000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (spot_id, user_id)
);

alter table public.reviews enable row level security;
drop policy if exists "ver reseñas" on public.reviews;
create policy "ver reseñas" on public.reviews for select to authenticated using (true);
drop policy if exists "escribir mi reseña" on public.reviews;
create policy "escribir mi reseña" on public.reviews for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "editar mi reseña" on public.reviews;
create policy "editar mi reseña" on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "borrar reseña" on public.reviews;
create policy "borrar reseña" on public.reviews for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Las valoraciones y notas que ya existían pasan a ser la reseña de quien puso la concha
insert into public.reviews (spot_id, user_id, username, rating, body, created_at, updated_at)
select s.id, s.author_id, coalesce(s.author, ''), s.rating, s.notes, s.created_at, s.updated_at
from public.spots s
where s.author_id is not null and s.rating > 0
on conflict (spot_id, user_id) do nothing;

-- …y no se repiten como descripción de la concha
update public.spots s set notes = ''
where s.notes <> '' and exists (select 1 from public.reviews r where r.spot_id = s.id and r.user_id = s.author_id and r.body = s.notes);

-- ───────── Utilidades ─────────
create or replace function public.distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

create or replace function public.today_madrid() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

-- ───────── Retos diarios ─────────
create table if not exists public.challenges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  username      text not null default '',
  spot_id       uuid not null references public.spots(id) on delete cascade,
  day           date not null,
  slot          int not null check (slot in (1, 2)),
  status        text not null default 'assigned' check (status in ('assigned', 'submitted', 'approved', 'rejected')),
  video_path    text,
  recorded_at   timestamptz,          -- hora de grabación según el móvil
  submitted_at  timestamptz,          -- hora de envío según el servidor
  lat           double precision,     -- ubicación del móvil al enviar
  lng           double precision,
  accuracy_m    double precision,
  distance_m    double precision,     -- distancia a la concha al enviar
  reviewed_at   timestamptz,
  points        int not null default 0,
  created_at    timestamptz not null default now(),
  unique (user_id, day, slot)
);
create index if not exists challenges_status_idx on public.challenges (status, submitted_at);

alter table public.notifications add column if not exists challenge_id uuid references public.challenges(id) on delete cascade;

alter table public.challenges enable row level security;
drop policy if exists "ver mis retos" on public.challenges;
create policy "ver mis retos" on public.challenges for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Crear, enviar y revisar retos se hace con las funciones de abajo.

-- Reparte los 2 retos del día al azar entre las conchas cercanas (dentro de p_radius_km).
-- Se sortean en el servidor: nadie puede elegir su concha.
create or replace function public.assign_daily_challenges(p_lat double precision, p_lng double precision, p_radius_km double precision default 15)
returns setof public.challenges
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  d date := public.today_madrid();
  who text := coalesce(auth.jwt() -> 'user_metadata' ->> 'username', '');
  n int;
begin
  if me is null then raise exception 'Hace falta iniciar sesión'; end if;
  select count(*) into n from public.challenges where user_id = me and day = d;
  if n < 2 then
    insert into public.challenges (user_id, username, spot_id, day, slot)
    select me, who, pick.id, d, n + row_number() over ()
    from (
      select s.id
      from public.spots s
      where public.distance_km(p_lat, p_lng, s.lat, s.lng) <= p_radius_km
        and s.id not in (select c.spot_id from public.challenges c where c.user_id = me and c.day = d)
      -- primero las que tienen foto (hace falta para comprobar el vídeo), al azar entre ellas
      order by exists (select 1 from public.media m where m.spot_id = s.id and m.kind = 'image') desc, random()
      limit 2 - n
    ) pick
    on conflict do nothing;
  end if;
  return query select * from public.challenges where user_id = me and day = d order by slot;
end $$;

-- Enviar el vídeo de un reto (solo el mismo día)
create or replace function public.submit_challenge(
  p_id uuid, p_video_path text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_recorded_at timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  s public.spots;
  dist double precision;
begin
  select * into c from public.challenges where id = p_id and user_id = auth.uid();
  if c.id is null then raise exception 'Ese reto no es tuyo'; end if;
  if c.status <> 'assigned' then raise exception 'Este reto ya se envió'; end if;
  if c.day <> public.today_madrid() then raise exception 'Este reto ya ha caducado: era del %', to_char(c.day, 'DD/MM'); end if;
  select * into s from public.spots where id = c.spot_id;
  dist := case when p_lat is null or p_lng is null then null else public.distance_km(p_lat, p_lng, s.lat, s.lng) * 1000 end;

  update public.challenges
  set status = 'submitted', video_path = p_video_path, submitted_at = now(), recorded_at = p_recorded_at,
      lat = p_lat, lng = p_lng, accuracy_m = p_accuracy, distance_m = dist
  where id = p_id;

  insert into public.notifications (user_id, kind, title, body, spot_id, challenge_id)
  select public.admin_user_id(), 'challenge_review', 'Reto por revisar',
         coalesce(nullif(c.username, ''), 'Alguien') || ' ha enviado el vídeo del reto en «' || s.name || '»'
           || case when dist is null then ' (sin ubicación).' else ' (a ' || round(dist)::text || ' m de la concha).' end,
         s.id, p_id
  where public.admin_user_id() is not null;
end $$;

-- Los ermitaños deciden si el reto está cumplido. 10 puntos, 20 si la concha es sagrada.
create or replace function public.resolve_challenge(p_id uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  s public.spots;
  pts int;
begin
  if not public.is_admin() then raise exception 'Solo los ermitaños pueden revisar retos'; end if;
  select * into c from public.challenges where id = p_id;
  if c.id is null or c.status <> 'submitted' then raise exception 'Ese reto ya no está pendiente de revisión'; end if;
  select * into s from public.spots where id = c.spot_id;
  pts := case when not p_ok then 0 when s.sacred then 20 else 10 end;

  update public.challenges set status = case when p_ok then 'approved' else 'rejected' end, reviewed_at = now(), points = pts
  where id = p_id;

  delete from public.notifications where kind = 'challenge_review' and challenge_id = p_id;

  insert into public.notifications (user_id, kind, title, body, spot_id, challenge_id)
  values (
    c.user_id,
    case when p_ok then 'challenge_approved' else 'challenge_rejected' end,
    case when p_ok then '¡Reto cumplido! +' || pts || ' puntos' else 'Reto no cumplido' end,
    case when p_ok
      then 'Los ermitaños han validado tu cookeada en «' || s.name || '».'
      else 'Los ermitaños no han podido validar tu cookeada en «' || s.name || '».'
    end,
    c.spot_id, p_id
  );
end $$;

-- Ranking de cookeadores: puntos de retos cumplidos (desde p_since, o de siempre)
create or replace function public.ranking(p_since timestamptz default null)
returns table (user_id uuid, username text, points bigint, retos bigint)
language sql stable security definer set search_path = public as $$
  select c.user_id, max(c.username) as username, sum(c.points)::bigint as points, count(*)::bigint as retos
  from public.challenges c
  where c.status = 'approved' and (p_since is null or c.reviewed_at >= p_since)
  group by c.user_id
  order by points desc, retos desc, username
$$;

grant execute on function public.assign_daily_challenges(double precision, double precision, double precision) to authenticated;
grant execute on function public.submit_challenge(uuid, text, double precision, double precision, double precision, timestamptz) to authenticated;
grant execute on function public.resolve_challenge(uuid, boolean) to authenticated;
grant execute on function public.ranking(timestamptz) to authenticated;

-- ───────── Tiempo real ─────────
do $$
declare t text;
begin
  foreach t in array array['reviews', 'challenges'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
