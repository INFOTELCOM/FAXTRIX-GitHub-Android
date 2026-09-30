-- FAXTRIX — ticketing professionnel : numérotation, traçabilité et autosauvegarde

alter table public.tickets
  add column if not exists numero text,
  add column if not exists opened_at timestamptz not null default now(),
  add column if not exists problem text,
  add column if not exists tasks text,
  add column if not exists recommendations text,
  add column if not exists resolution text,
  add column if not exists closed_at timestamptz,
  add column if not exists last_autosaved_at timestamptz;

create table if not exists public.ticket_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_number bigint not null default 0
);

alter table public.ticket_counters enable row level security;
revoke all on public.ticket_counters from anon, authenticated, public;

create or replace function public.assign_ticket_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_no bigint;
begin
  if new.numero is not null and new.numero <> '' then
    return new;
  end if;

  insert into public.ticket_counters(company_id, last_number)
  values (new.company_id, 1)
  on conflict (company_id) do update
    set last_number = public.ticket_counters.last_number + 1
  returning last_number into next_no;

  new.numero := 'FX-' || to_char(coalesce(new.opened_at, now()), 'YYYY') || '-' || lpad(next_no::text, 6, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_ticket_number on public.tickets;
create trigger trg_assign_ticket_number
before insert on public.tickets
for each row execute function public.assign_ticket_number();

create unique index if not exists tickets_company_numero_uidx
  on public.tickets(company_id, numero);

create index if not exists tickets_company_opened_idx
  on public.tickets(company_id, opened_at desc);

create index if not exists tickets_company_autosave_idx
  on public.tickets(company_id, last_autosaved_at desc);

-- Une fermeture explicite renseigne automatiquement la date de clôture.
create or replace function public.sync_ticket_closed_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.statut in ('Résolu','Fermé') and (old.statut is distinct from new.statut) then
    new.closed_at := coalesce(new.closed_at, now());
    new.resolved_at := coalesce(new.resolved_at, now());
  elsif new.statut not in ('Résolu','Fermé') then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_ticket_closed_at on public.tickets;
create trigger trg_sync_ticket_closed_at
before update on public.tickets
for each row execute function public.sync_ticket_closed_at();


-- Session de travail du technicien : début, fin et durée calculée automatiquement.
alter table public.tickets
  add column if not exists work_started_at timestamptz,
  add column if not exists work_closed_at timestamptz,
  add column if not exists work_duration_seconds bigint;

create or replace function public.sync_ticket_work_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.work_closed_at is not null and new.work_started_at is not null then
    new.work_duration_seconds := greatest(0, floor(extract(epoch from (new.work_closed_at - new.work_started_at)))::bigint);
    new.closed_at := coalesce(new.closed_at, new.work_closed_at);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_ticket_work_session on public.tickets;
create trigger trg_sync_ticket_work_session
before update on public.tickets
for each row execute function public.sync_ticket_work_session();

create index if not exists tickets_company_work_session_idx
  on public.tickets(company_id, work_started_at desc, work_closed_at);
