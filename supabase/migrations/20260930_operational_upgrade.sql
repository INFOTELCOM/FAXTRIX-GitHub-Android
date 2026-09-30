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
