-- FAXTRIX — Portail Client séparé des comptes employés
alter table public.clients add column if not exists email text, add column if not exists telephone text;
create table if not exists public.client_portal_accounts(
 id uuid primary key references auth.users(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 client_id uuid not null unique references public.clients(id) on delete cascade,
 email text not null, full_name text not null, active boolean not null default true,
 created_at timestamptz not null default now(), last_seen_at timestamptz
);
create unique index if not exists client_portal_accounts_company_email_idx on public.client_portal_accounts(company_id,lower(email));
create index if not exists client_portal_accounts_company_idx on public.client_portal_accounts(company_id,client_id);
create table if not exists public.client_portal_messages(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 client_id uuid not null references public.clients(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 sender_type text not null check(sender_type in('employee','client')),
 body text not null, created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists client_portal_messages_client_created_idx on public.client_portal_messages(client_id,created_at);
create index if not exists client_portal_messages_company_created_idx on public.client_portal_messages(company_id,created_at);
create or replace function public.is_my_client_portal_user() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.client_portal_accounts a where a.id=auth.uid() and a.active=true);$$;
drop function if exists public.my_client_portal_account();
create function public.my_client_portal_account() returns table(id uuid,company_id uuid,client_id uuid,email text,full_name text,active boolean,client_name text,telephone text)
language sql stable security definer set search_path=public,pg_temp as $$select a.id,a.company_id,a.client_id,a.email,a.full_name,a.active,c.nom,c.telephone from public.client_portal_accounts a join public.clients c on c.id=a.client_id and c.company_id=a.company_id where a.id=auth.uid() and a.active=true;$$;
create or replace function public.my_client_portal_tickets() returns table(id uuid,numero text,titre text,statut text,priorite text,created_at timestamptz,description text,resolution text)
language sql stable security definer set search_path=public,pg_temp as $$select t.id,t.numero,t.titre,t.statut,t.priorite,t.created_at,t.description,t.resolution from public.tickets t where public.is_my_client_portal_user() and t.company_id=(select a.company_id from public.client_portal_accounts a where a.id=auth.uid()) and lower(coalesce(t.client,''))=lower((select c.nom from public.client_portal_accounts a join public.clients c on c.id=a.client_id where a.id=auth.uid())) order by t.created_at desc;$$;
revoke all on function public.is_my_client_portal_user() from public;
revoke all on function public.my_client_portal_account() from public;
revoke all on function public.my_client_portal_tickets() from public;
grant execute on function public.is_my_client_portal_user() to authenticated;
grant execute on function public.my_client_portal_account() to authenticated;
grant execute on function public.my_client_portal_tickets() to authenticated;
alter table public.client_portal_accounts enable row level security;
alter table public.client_portal_messages enable row level security;
drop policy if exists client_portal_accounts_select on public.client_portal_accounts;
create policy client_portal_accounts_select on public.client_portal_accounts for select to authenticated using(id=auth.uid() or company_id=(select p.company_id from public.profiles p where p.id=auth.uid()));
drop policy if exists client_portal_accounts_update on public.client_portal_accounts;
create policy client_portal_accounts_update on public.client_portal_accounts for update to authenticated using(company_id=(select p.company_id from public.profiles p where p.id=auth.uid())) with check(company_id=(select p.company_id from public.profiles p where p.id=auth.uid()));
drop policy if exists client_portal_messages_select on public.client_portal_messages;
create policy client_portal_messages_select on public.client_portal_messages for select to authenticated using((public.is_my_client_portal_user() and client_id=(select a.client_id from public.client_portal_accounts a where a.id=auth.uid())) or company_id=(select p.company_id from public.profiles p where p.id=auth.uid()));
drop policy if exists client_portal_messages_insert on public.client_portal_messages;
create policy client_portal_messages_insert on public.client_portal_messages for insert to authenticated with check((sender_type='client' and sender_id=auth.uid() and public.is_my_client_portal_user() and client_id=(select a.client_id from public.client_portal_accounts a where a.id=auth.uid()) and company_id=(select a.company_id from public.client_portal_accounts a where a.id=auth.uid())) or (sender_type='employee' and sender_id=auth.uid() and company_id=(select p.company_id from public.profiles p where p.id=auth.uid())));
drop policy if exists client_portal_messages_update on public.client_portal_messages;
create policy client_portal_messages_update on public.client_portal_messages for update to authenticated using(sender_id=auth.uid() or company_id=(select p.company_id from public.profiles p where p.id=auth.uid())) with check(sender_id=auth.uid() or company_id=(select p.company_id from public.profiles p where p.id=auth.uid()));