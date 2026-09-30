-- FAXTRIX — upgrade opérationnel CRM / tickets / terrain / rapports
-- Ajoute des champs professionnels sans casser les données existantes.

alter table public.tickets
  add column if not exists categorie text not null default 'Général',
  add column if not exists description text,
  add column if not exists assigned_to text,
  add column if not exists due_at timestamptz,
  add column if not exists resolved_at timestamptz;

alter table public.terrain_missions
  add column if not exists adresse text,
  add column if not exists notes text,
  add column if not exists compte_rendu text;

create index if not exists tickets_company_status_idx
  on public.tickets(company_id, statut);

create index if not exists tickets_company_priority_idx
  on public.tickets(company_id, priorite);

create index if not exists tickets_company_due_idx
  on public.tickets(company_id, due_at);

create index if not exists terrain_company_status_idx
  on public.terrain_missions(company_id, statut);

-- Les champs restent protégés par les politiques RLS déjà présentes.


-- Horodatage complet des interventions terrain.
alter table public.terrain_missions
  add column if not exists completed_at timestamptz;

create or replace function public.sync_terrain_completed_at()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.statut = 'Terminée' and old.statut is distinct from new.statut then
    new.completed_at := coalesce(new.completed_at, now());
    if new.started_at is not null then
      new.elapsed_ms := greatest(
        coalesce(new.elapsed_ms,0),
        floor(extract(epoch from (new.completed_at-new.started_at))*1000)::bigint
      );
    end if;
  elsif new.statut <> 'Terminée' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_terrain_completed_at on public.terrain_missions;
create trigger trg_sync_terrain_completed_at
before update on public.terrain_missions
for each row execute function public.sync_terrain_completed_at();

create index if not exists terrain_company_completed_idx
on public.terrain_missions(company_id, completed_at desc);

-- Dernière sauvegarde automatique d'un ticket.
create or replace function public.sync_ticket_last_saved()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.last_autosaved_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_ticket_last_saved on public.tickets;
create trigger trg_sync_ticket_last_saved
before update on public.tickets
for each row execute function public.sync_ticket_last_saved();
