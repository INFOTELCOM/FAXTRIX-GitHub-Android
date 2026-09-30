-- FAXTRIX — accès tickets par entreprise
-- Les membres authentifiés de l'entreprise peuvent consulter et créer des tickets.
-- La modification reste contrôlée par ticket_edit_permissions.sql :
-- auteur du ticket ou permission tickets_manage.
-- La suppression reste réservée à la permission data_delete.

alter table public.tickets enable row level security;

drop policy if exists faxtrix_tickets_insert_permission on public.tickets;
create policy faxtrix_tickets_insert_company
on public.tickets
as permissive
for insert
to authenticated
with check (
  company_id = (select p.company_id from public.profiles p where p.id = (select auth.uid()))
);

drop policy if exists faxtrix_tickets_select_company on public.tickets;
create policy faxtrix_tickets_select_company
on public.tickets
as permissive
for select
to authenticated
using (
  company_id = (select p.company_id from public.profiles p where p.id = (select auth.uid()))
);

create index if not exists tickets_company_created_idx
  on public.tickets(company_id, created_at desc);
