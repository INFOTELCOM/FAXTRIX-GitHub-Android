-- FAXTRIX — correction des tickets par leur auteur + historique des modifications

alter table public.tickets
  add column if not exists opened_by uuid references auth.users(id),
  add column if not exists last_modified_by uuid references auth.users(id),
  add column if not exists last_modified_at timestamptz;

-- Les anciens tickets restent compatibles : on renseigne l'auteur lors des prochaines modifications.
create table if not exists public.ticket_edit_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  editor_id uuid references auth.users(id),
  action text not null default 'update',
  changed_at timestamptz not null default now(),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb
);

alter table public.ticket_edit_history enable row level security;

drop policy if exists ticket_edit_history_read on public.ticket_edit_history;
create policy ticket_edit_history_read on public.ticket_edit_history
for select to authenticated
using (
  editor_id=auth.uid()
  or company_id=(select company_id from public.profiles where id=auth.uid())
  and public.has_faxtrix_permission('tickets_manage')
  or public.is_infotelcom_admin()
);

revoke insert, update, delete on public.ticket_edit_history from anon, authenticated, public;

create or replace function public.track_ticket_edit()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    if new.opened_by is null then
      new.opened_by := auth.uid();
    end if;
    new.last_modified_by := auth.uid();
    new.last_modified_at := now();
    return new;
  end if;

  new.last_modified_by := auth.uid();
  new.last_modified_at := now();

  insert into public.ticket_edit_history(
    ticket_id, company_id, editor_id, action, before_data, after_data
  )
  values(
    old.id,
    old.company_id,
    auth.uid(),
    'update',
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;

drop trigger if exists trg_track_ticket_edit on public.tickets;
create trigger trg_track_ticket_edit
before insert or update on public.tickets
for each row execute function public.track_ticket_edit();

-- Un technicien disposant de tickets_manage peut modifier tous les tickets de son entreprise.
-- Le créateur d'un ticket peut aussi corriger son propre ticket, même sans tickets_manage.
drop policy if exists faxtrix_tickets_update_permission on public.tickets;
create policy faxtrix_tickets_update_permission on public.tickets
as restrictive for update to authenticated
using (
  (select public.has_faxtrix_permission('tickets_manage'))
  or opened_by=(select auth.uid())
)
with check (
  (select public.has_faxtrix_permission('tickets_manage'))
  or opened_by=(select auth.uid())
);

-- L'auteur peut continuer à corriger son ticket même après sa fermeture.
create index if not exists tickets_company_opened_by_idx
  on public.tickets(company_id, opened_by);

create index if not exists ticket_edit_history_ticket_idx
  on public.ticket_edit_history(ticket_id, changed_at desc);
