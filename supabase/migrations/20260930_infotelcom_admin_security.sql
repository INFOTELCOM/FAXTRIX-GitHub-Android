-- FAXTRIX / INFOTELCOM — administration, droits, demandes et audit
create extension if not exists pgcrypto;

create table if not exists public.permission_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requested_right text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  unique(user_id, permission)
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.permission_requests enable row level security;
alter table public.user_permissions enable row level security;
alter table public.admin_audit_logs enable row level security;

create or replace function public.is_infotelcom_admin()
returns boolean
language sql
security definer
set search_path=''
as $$
  select exists (
    select 1 from public.profiles
    where id=auth.uid() and role='infotelcom_admin'
  );
$$;

revoke all on function public.is_infotelcom_admin() from public;
grant execute on function public.is_infotelcom_admin() to authenticated;

-- Lecture des droits de l'utilisateur connecté.
create or replace function public.my_permissions()
returns table(permission text, granted_at timestamptz, expires_at timestamptz)
language sql
security definer
set search_path=''
as $$
  select up.permission, up.granted_at, up.expires_at
  from public.user_permissions up
  where up.user_id=auth.uid()
    and (up.expires_at is null or up.expires_at > now())
  order by up.permission;
$$;

revoke all on function public.my_permissions() from public;
grant execute on function public.my_permissions() to authenticated;

create or replace function public.request_faxtrix_permission(p_right text, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company uuid;
  v_id uuid;
begin
  select company_id into v_company from public.profiles where id=auth.uid();
  if v_company is null then raise exception 'Profil entreprise introuvable'; end if;
  if not exists (select 1 from public.user_permissions where user_id=auth.uid() and permission=p_right) then
    insert into public.permission_requests(company_id,requester_id,requested_right,reason)
    values(v_company,auth.uid(),trim(p_right),nullif(trim(coalesce(p_reason,'')),''))
    returning id into v_id;
  else
    raise exception 'Ce droit est déjà accordé';
  end if;
  return v_id;
end;
$$;

revoke all on function public.request_faxtrix_permission(text,text) from public;
grant execute on function public.request_faxtrix_permission(text,text) to authenticated;

create or replace function public.my_permission_requests()
returns table(id uuid, requested_right text, reason text, status text, admin_note text, created_at timestamptz, reviewed_at timestamptz)
language sql
security definer
set search_path=''
as $$
  select id, requested_right, reason, status, admin_note, created_at, reviewed_at
  from public.permission_requests
  where requester_id=auth.uid()
  order by created_at desc;
$$;

revoke all on function public.my_permission_requests() from public;
grant execute on function public.my_permission_requests() to authenticated;

-- Vue administration : aucun service_role dans le navigateur.
create or replace function public.infotelcom_admin_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v jsonb;
begin
  if not public.is_infotelcom_admin() then raise exception 'Accès administrateur INFOTELCOM refusé'; end if;
  select jsonb_build_object(
    'profile', coalesce((select row_to_json(p)::jsonb from public.profiles p where p.id=auth.uid()), '{}'::jsonb),
    'companies', coalesce((select jsonb_agg(x) from (
      select c.id,c.name,count(distinct p.id) as users_count
      from public.companies c
      left join public.profiles p on p.company_id=c.id
      group by c.id,c.name
      order by c.name
    ) x),'[]'::jsonb),
    'users', coalesce((select jsonb_agg(x) from (
      select p.id,p.full_name,p.role,p.company_id,c.name as company_name
      from public.profiles p left join public.companies c on c.id=p.company_id
      order by c.name,p.full_name
    ) x),'[]'::jsonb),
    'requests', coalesce((select jsonb_agg(x) from (
      select r.id,r.company_id,r.requester_id,r.requested_right,r.reason,r.status,r.admin_note,r.created_at,
             r.reviewed_at,p.full_name as requester_name,c.name as company_name
      from public.permission_requests r
      left join public.profiles p on p.id=r.requester_id
      left join public.companies c on c.id=r.company_id
      order by r.created_at desc
    ) x),'[]'::jsonb),
    'audit', coalesce((select jsonb_agg(x) from (
      select a.id,a.action,a.target_type,a.target_id,a.metadata,a.created_at,p.full_name as admin_name
      from public.admin_audit_logs a left join public.profiles p on p.id=a.admin_id
      order by a.created_at desc limit 200
    ) x),'[]'::jsonb)
  ) into v;
  return v;
end;
$$;

revoke all on function public.infotelcom_admin_bootstrap() from public;
grant execute on function public.infotelcom_admin_bootstrap() to authenticated;

create or replace function public.infotelcom_review_permission(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.permission_requests%rowtype;
begin
  if not public.is_infotelcom_admin() then raise exception 'Accès administrateur INFOTELCOM refusé'; end if;
  if p_decision not in ('approved','denied') then raise exception 'Décision invalide'; end if;
  select * into r from public.permission_requests where id=p_request_id for update;
  if not found then raise exception 'Demande introuvable'; end if;

  update public.permission_requests
    set status=p_decision, reviewed_by=auth.uid(), reviewed_at=now(), admin_note=nullif(trim(coalesce(p_note,'')),'')
  where id=p_request_id;

  if p_decision='approved' then
    insert into public.user_permissions(company_id,user_id,permission,granted_by)
    values(r.company_id,r.requester_id,r.requested_right,auth.uid())
    on conflict(user_id,permission) do update
      set company_id=excluded.company_id, granted_by=excluded.granted_by, granted_at=now(), expires_at=null;
  end if;

  insert into public.admin_audit_logs(admin_id,company_id,action,target_type,target_id,metadata)
  values(auth.uid(),r.company_id,'permission_'||p_decision,'permission_request',r.id::text,
         jsonb_build_object('right',r.requested_right,'requester_id',r.requester_id,'note',p_note));
  return true;
end;
$$;

revoke all on function public.infotelcom_review_permission(uuid,text,text) from public;
grant execute on function public.infotelcom_review_permission(uuid,text,text) to authenticated;

create or replace function public.infotelcom_set_user_role(p_user_id uuid,p_role text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company uuid;
  v_admin_count integer;
begin
  if not public.is_infotelcom_admin() then raise exception 'Accès administrateur INFOTELCOM refusé'; end if;
  if p_role not in ('owner','manager','commercial','technicien','lecture_seule','infotelcom_admin') then raise exception 'Rôle invalide'; end if;

  -- Protection du compte qui administre INFOTELCOM :
  -- un administrateur ne peut pas supprimer/modifier son propre accès depuis cette interface.
  if p_user_id=auth.uid() then
    raise exception 'Votre propre rôle INFOTELCOM ne peut pas être modifié depuis cette interface';
  end if;

  select company_id into v_company from public.profiles where id=p_user_id;
  if v_company is null then raise exception 'Utilisateur introuvable'; end if;

  -- Ne jamais retirer le dernier administrateur INFOTELCOM.
  if (select role from public.profiles where id=p_user_id)='infotelcom_admin' and p_role<>'infotelcom_admin' then
    select count(*) into v_admin_count from public.profiles where role='infotelcom_admin';
    if v_admin_count<=1 then
      raise exception 'Impossible de retirer le dernier administrateur INFOTELCOM';
    end if;
  end if;

  update public.profiles set role=p_role where id=p_user_id;

  insert into public.admin_audit_logs(admin_id,company_id,action,target_type,target_id,metadata)
  values(auth.uid(),v_company,'role_changed','profile',p_user_id::text,jsonb_build_object('role',p_role));
  return true;
end;
$$;

revoke all on function public.infotelcom_set_user_role(uuid,text) from public;
grant execute on function public.infotelcom_set_user_role(uuid,text) to authenticated;

-- Export centralisé : les données restent côté Supabase et ne sont exposées qu'à un admin.
create or replace function public.infotelcom_export_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if not public.is_infotelcom_admin() then raise exception 'Accès administrateur INFOTELCOM refusé'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'Entreprise introuvable'; end if;

  select jsonb_build_object(
    'company', (select row_to_json(c)::jsonb from public.companies c where c.id=p_company_id),
    'profiles', coalesce((select jsonb_agg(to_jsonb(p)) from public.profiles p where p.company_id=p_company_id),'[]'::jsonb),
    'clients', coalesce((select jsonb_agg(to_jsonb(x)) from public.clients x where x.company_id=p_company_id),'[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(to_jsonb(x)) from public.tickets x where x.company_id=p_company_id),'[]'::jsonb),
    'terrain_missions', coalesce((select jsonb_agg(to_jsonb(x)) from public.terrain_missions x where x.company_id=p_company_id),'[]'::jsonb),
    'team_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.team_members x where x.company_id=p_company_id),'[]'::jsonb),
    'automation_rules', coalesce((select jsonb_agg(to_jsonb(x)) from public.automation_rules x where x.company_id=p_company_id),'[]'::jsonb)
  ) into result;

  insert into public.admin_audit_logs(admin_id,company_id,action,target_type,target_id)
  values(auth.uid(),p_company_id,'company_export','company',p_company_id::text);
  return result;
end;
$$;

revoke all on function public.infotelcom_export_company(uuid) from public;
grant execute on function public.infotelcom_export_company(uuid) to authenticated;

-- RLS minimal pour les nouvelles tables.
drop policy if exists permission_requests_read_company on public.permission_requests;
create policy permission_requests_read_company on public.permission_requests
for select to authenticated
using (requester_id=auth.uid() or company_id=(select company_id from public.profiles where id=auth.uid()) or public.is_infotelcom_admin());

drop policy if exists user_permissions_read_self on public.user_permissions;
create policy user_permissions_read_self on public.user_permissions
for select to authenticated
using (user_id=auth.uid() or public.is_infotelcom_admin());

drop policy if exists audit_admin_read on public.admin_audit_logs;
create policy audit_admin_read on public.admin_audit_logs
for select to authenticated
using (public.is_infotelcom_admin());

-- Contrôle centralisé des droits de modification.
create or replace function public.has_faxtrix_permission(p_permission text)
returns boolean
language sql
security definer
stable
set search_path=''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and (
        p.role in ('owner','infotelcom_admin')
        or exists (
          select 1 from public.user_permissions up
          where up.user_id=(select auth.uid())
            and up.permission=p_permission
            and (up.expires_at is null or up.expires_at > now())
        )
      )
  );
$$;

revoke all on function public.has_faxtrix_permission(text) from public;
grant execute on function public.has_faxtrix_permission(text) to authenticated;

-- Ces politiques sont RESTRICTIVE : elles s'ajoutent aux politiques d'isolation
-- existantes et empêchent un employé sans droit d'écrire/modifier.
drop policy if exists faxtrix_clients_insert_permission on public.clients;
create policy faxtrix_clients_insert_permission on public.clients
as restrictive for insert to authenticated
with check ((select public.has_faxtrix_permission('crm_edit')));

drop policy if exists faxtrix_clients_update_permission on public.clients;
create policy faxtrix_clients_update_permission on public.clients
as restrictive for update to authenticated
using ((select public.has_faxtrix_permission('crm_edit')))
with check ((select public.has_faxtrix_permission('crm_edit')));

drop policy if exists faxtrix_clients_delete_permission on public.clients;
create policy faxtrix_clients_delete_permission on public.clients
as restrictive for delete to authenticated
using ((select public.has_faxtrix_permission('data_delete')));

drop policy if exists faxtrix_tickets_insert_permission on public.tickets;
create policy faxtrix_tickets_insert_permission on public.tickets
as restrictive for insert to authenticated
with check ((select public.has_faxtrix_permission('tickets_manage')));

drop policy if exists faxtrix_tickets_update_permission on public.tickets;
create policy faxtrix_tickets_update_permission on public.tickets
as restrictive for update to authenticated
using ((select public.has_faxtrix_permission('tickets_manage')))
with check ((select public.has_faxtrix_permission('tickets_manage')));

drop policy if exists faxtrix_tickets_delete_permission on public.tickets;
create policy faxtrix_tickets_delete_permission on public.tickets
as restrictive for delete to authenticated
using ((select public.has_faxtrix_permission('data_delete')));

drop policy if exists faxtrix_terrain_insert_permission on public.terrain_missions;
create policy faxtrix_terrain_insert_permission on public.terrain_missions
as restrictive for insert to authenticated
with check ((select public.has_faxtrix_permission('terrain_manage')));

drop policy if exists faxtrix_terrain_update_permission on public.terrain_missions;
create policy faxtrix_terrain_update_permission on public.terrain_missions
as restrictive for update to authenticated
using ((select public.has_faxtrix_permission('terrain_manage')))
with check ((select public.has_faxtrix_permission('terrain_manage')));

drop policy if exists faxtrix_terrain_delete_permission on public.terrain_missions;
create policy faxtrix_terrain_delete_permission on public.terrain_missions
as restrictive for delete to authenticated
using ((select public.has_faxtrix_permission('data_delete')));

drop policy if exists faxtrix_team_insert_permission on public.team_members;
create policy faxtrix_team_insert_permission on public.team_members
as restrictive for insert to authenticated
with check ((select public.has_faxtrix_permission('team_manage')));

drop policy if exists faxtrix_team_update_permission on public.team_members;
create policy faxtrix_team_update_permission on public.team_members
as restrictive for update to authenticated
using ((select public.has_faxtrix_permission('team_manage')))
with check ((select public.has_faxtrix_permission('team_manage')));

drop policy if exists faxtrix_team_delete_permission on public.team_members;
create policy faxtrix_team_delete_permission on public.team_members
as restrictive for delete to authenticated
using ((select public.has_faxtrix_permission('data_delete')));

drop policy if exists faxtrix_automation_insert_permission on public.automation_rules;
create policy faxtrix_automation_insert_permission on public.automation_rules
as restrictive for insert to authenticated
with check ((select public.has_faxtrix_permission('automation_manage')));

drop policy if exists faxtrix_automation_update_permission on public.automation_rules;
create policy faxtrix_automation_update_permission on public.automation_rules
as restrictive for update to authenticated
using ((select public.has_faxtrix_permission('automation_manage')))
with check ((select public.has_faxtrix_permission('automation_manage')));

drop policy if exists faxtrix_automation_delete_permission on public.automation_rules;
create policy faxtrix_automation_delete_permission on public.automation_rules
as restrictive for delete to authenticated
using ((select public.has_faxtrix_permission('automation_manage')));

