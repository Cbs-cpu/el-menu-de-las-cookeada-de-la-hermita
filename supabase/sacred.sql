-- El menú de cookeadas de la ermita · Conchas sagradas y notificaciones
-- Ejecutar DESPUÉS de schema.sql y auth.sql: Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.

-- ───────── Administración ─────────
-- Por ahora el único administrador es la cuenta "los hermitaños".
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'los-hermitanos@hermita.app'
$$;

create or replace function public.admin_user_id() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where email = 'los-hermitanos@hermita.app' limit 1
$$;

-- ───────── Conchas: sagrada y dueño ─────────
alter table public.spots add column if not exists sacred boolean not null default false;
alter table public.spots add column if not exists author_id uuid default auth.uid() references auth.users(id) on delete set null;

-- Dueño de las conchas que ya existían, a partir del nombre de usuario guardado
update public.spots s set author_id = u.id
from auth.users u
where s.author_id is null and s.author is not null and u.raw_user_meta_data ->> 'username' = s.author;

-- Solo el administrador puede poner o quitar "sagrada"
create or replace function public.guard_sacred() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.sacred and not public.is_admin() then
      raise exception 'Solo los ermitaños pueden crear conchas sagradas';
    end if;
    new.author_id := coalesce(new.author_id, auth.uid());
  elsif new.sacred is distinct from old.sacred then
    if not public.is_admin() then
      raise exception 'Solo los ermitaños pueden cambiar si una concha es sagrada';
    end if;
  end if;
  -- El dueño no se puede cambiar desde la app
  if tg_op = 'UPDATE' then
    new.author_id := old.author_id;
  end if;
  return new;
end $$;

drop trigger if exists guard_sacred on public.spots;
create trigger guard_sacred before insert or update on public.spots
for each row execute function public.guard_sacred();

-- ───────── Peticiones y votos ─────────
create table if not exists public.sacred_requests (
  id            uuid primary key default gen_random_uuid(),
  spot_id       uuid not null references public.spots(id) on delete cascade,
  requested_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  requester     text not null default '',
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
-- Como mucho una petición abierta por concha
create unique index if not exists sacred_requests_one_pending on public.sacred_requests (spot_id) where status = 'pending';

create table if not exists public.sacred_votes (
  request_id  uuid not null references public.sacred_requests(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table public.sacred_requests enable row level security;
alter table public.sacred_votes enable row level security;

drop policy if exists "ver peticiones" on public.sacred_requests;
create policy "ver peticiones" on public.sacred_requests for select to authenticated using (true);
-- Crear, retirar y resolver peticiones se hace con las funciones de abajo.

drop policy if exists "ver votos" on public.sacred_votes;
create policy "ver votos" on public.sacred_votes for select to authenticated using (true);
drop policy if exists "votar" on public.sacred_votes;
create policy "votar" on public.sacred_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.sacred_requests r where r.id = request_id and r.status = 'pending')
  );
drop policy if exists "quitar voto" on public.sacred_votes;
create policy "quitar voto" on public.sacred_votes for delete to authenticated using (user_id = auth.uid());

-- ───────── Notificaciones ─────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null default '',
  spot_id     uuid references public.spots(id) on delete cascade,
  request_id  uuid references public.sacred_requests(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "mis notificaciones" on public.notifications;
create policy "mis notificaciones" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "marcar leida" on public.notifications;
create policy "marcar leida" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "borrar mis notificaciones" on public.notifications;
create policy "borrar mis notificaciones" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ───────── Funciones que usa la app ─────────

-- El dueño de una concha pide que sea sagrada
create or replace function public.request_sacred(p_spot uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.spots;
  req_id uuid;
  who text := coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'alguien');
begin
  select * into s from public.spots where id = p_spot;
  if s.id is null then raise exception 'Esa concha no existe'; end if;
  if s.sacred then raise exception 'Esa concha ya es sagrada'; end if;
  if s.author_id is distinct from auth.uid() then raise exception 'Solo quien puso la concha puede pedir que sea sagrada'; end if;

  insert into public.sacred_requests (spot_id, requested_by, requester) values (p_spot, auth.uid(), who)
  returning id into req_id;

  -- Revisión para los ermitaños
  insert into public.notifications (user_id, kind, title, body, spot_id, request_id)
  select public.admin_user_id(), 'sacred_review', 'Revisión de concha sagrada',
         who || ' pide que «' || s.name || '» sea concha sagrada.', p_spot, req_id
  where public.admin_user_id() is not null and public.admin_user_id() <> auth.uid();

  -- Aviso al resto para que voten
  insert into public.notifications (user_id, kind, title, body, spot_id, request_id)
  select u.id, 'sacred_vote', 'Nueva candidata a concha sagrada',
         who || ' quiere que «' || s.name || '» sea concha sagrada. Vota si te parece.', p_spot, req_id
  from auth.users u
  where u.id <> auth.uid() and u.id is distinct from public.admin_user_id();

  return req_id;
exception when unique_violation then
  raise exception 'Esa concha ya tiene una petición abierta';
end $$;

-- El dueño retira su petición
create or replace function public.withdraw_sacred(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.sacred_requests set status = 'withdrawn', resolved_at = now()
  where id = p_request and status = 'pending' and requested_by = auth.uid();
  delete from public.notifications where request_id = p_request and kind in ('sacred_review', 'sacred_vote');
end $$;

-- Los ermitaños deciden
create or replace function public.resolve_sacred(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.sacred_requests;
  spot_name text;
begin
  if not public.is_admin() then raise exception 'Solo los ermitaños pueden decidir'; end if;
  select * into r from public.sacred_requests where id = p_request;
  if r.id is null or r.status <> 'pending' then raise exception 'Esa petición ya no está abierta'; end if;

  update public.sacred_requests set status = case when p_approve then 'approved' else 'rejected' end, resolved_at = now()
  where id = p_request;
  if p_approve then
    update public.spots set sacred = true where id = r.spot_id;
  end if;
  select name into spot_name from public.spots where id = r.spot_id;

  -- La revisión y las llamadas a votar ya no hacen falta
  delete from public.notifications where request_id = p_request and kind in ('sacred_review', 'sacred_vote');

  insert into public.notifications (user_id, kind, title, body, spot_id, request_id)
  values (
    r.requested_by,
    case when p_approve then 'sacred_approved' else 'sacred_rejected' end,
    case when p_approve then '¡Concha sagrada!' else 'Petición de concha sagrada' end,
    case when p_approve
      then 'Los ermitaños han declarado «' || spot_name || '» concha sagrada.'
      else 'Los ermitaños han decidido que «' || spot_name || '» no sea concha sagrada, por ahora.'
    end,
    r.spot_id, p_request
  );
end $$;

-- Si los ermitaños hacen sagrada una concha directamente, se cierra su petición abierta
create or replace function public.close_requests_on_sacred() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sacred and not coalesce(old.sacred, false) then
    update public.sacred_requests set status = 'approved', resolved_at = now()
    where spot_id = new.id and status = 'pending';
  end if;
  return new;
end $$;

drop trigger if exists close_requests_on_sacred on public.spots;
create trigger close_requests_on_sacred after update on public.spots
for each row execute function public.close_requests_on_sacred();

grant execute on function public.request_sacred(uuid) to authenticated;
grant execute on function public.withdraw_sacred(uuid) to authenticated;
grant execute on function public.resolve_sacred(uuid, boolean) to authenticated;

-- ───────── Tiempo real ─────────
do $$
declare t text;
begin
  foreach t in array array['sacred_requests', 'sacred_votes', 'notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
