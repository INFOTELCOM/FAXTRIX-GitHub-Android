-- FAXTRIX — analytics entreprise, sessions et pièces jointes tickets
-- À exécuter une fois dans Supabase SQL Editor.

create table if not exists public.company_session_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  auth_session_id uuid,
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  last_seen_at timestamptz not null default now(),
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists company_session_events_company_login_idx
  on public.company_session_events(company_id, login_at desc);
create index if not exists company_session_events_user_login_idx
  on public.company_session_events(user_id, login_at desc);

alter table public.company_session_events enable row level security;
revoke all on public.company_session_events from anon, authenticated;
grant select, insert, update on public.company_session_events to authenticated;

drop policy if exists company_session_events_select on public.company_session_events;
create policy company_session_events_select
on public.company_session_events for select to authenticated
using (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()));

drop policy if exists company_session_events_insert on public.company_session_events;
create policy company_session_events_insert
on public.company_session_events for insert to authenticated
with check (
  user_id = auth.uid()
  and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists company_session_events_update on public.company_session_events;
create policy company_session_events_update
on public.company_session_events for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.record_company_login(
  p_auth_session_id uuid default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cid uuid;
  sid uuid := gen_random_uuid();
begin
  select company_id into cid from public.profiles where id = auth.uid();
  if cid is null then raise exception 'Profil entreprise introuvable'; end if;
  insert into public.company_session_events(id,company_id,user_id,auth_session_id,user_agent)
  values(sid,cid,auth.uid(),p_auth_session_id,p_user_agent);
  return sid;
end;
$$;

create or replace function public.record_company_logout(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.company_session_events
  set logout_at=coalesce(logout_at,now()), last_seen_at=now()
  where id=p_session_id and user_id=auth.uid();
  return found;
end;
$$;

revoke all on function public.record_company_login(uuid,text) from public;
revoke all on function public.record_company_login(uuid,text) from anon;
grant execute on function public.record_company_login(uuid,text) to authenticated;
revoke all on function public.record_company_logout(uuid) from public;
revoke all on function public.record_company_logout(uuid) from anon;
grant execute on function public.record_company_logout(uuid) to authenticated;

-- Pièces jointes privées des tickets.
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists ticket_attachments_ticket_idx
  on public.ticket_attachments(ticket_id, created_at desc);
create index if not exists ticket_attachments_company_idx
  on public.ticket_attachments(company_id, created_at desc);

alter table public.ticket_attachments enable row level security;
revoke all on public.ticket_attachments from anon, authenticated;
grant select, insert, delete on public.ticket_attachments to authenticated;

drop policy if exists ticket_attachments_select on public.ticket_attachments;
create policy ticket_attachments_select
on public.ticket_attachments for select to authenticated
using (company_id = (select p.company_id from public.profiles p where p.id = auth.uid()));

drop policy if exists ticket_attachments_insert on public.ticket_attachments;
create policy ticket_attachments_insert
on public.ticket_attachments for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_id and t.company_id = public.ticket_attachments.company_id
  )
);

drop policy if exists ticket_attachments_delete on public.ticket_attachments;
create policy ticket_attachments_delete
on public.ticket_attachments for delete to authenticated
using (
  company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  and (uploaded_by = auth.uid() or exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role in ('owner','manager','infotelcom_admin')
  ))
);

insert into storage.buckets(id,name,public)
values('faxtrix-tickets','faxtrix-tickets',false)
on conflict (id) do nothing;

drop policy if exists faxtrix_ticket_files_insert on storage.objects;
create policy faxtrix_ticket_files_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='faxtrix-tickets'
  and (storage.foldername(name))[1] = (select p.company_id::text from public.profiles p where p.id=auth.uid())
  and exists (
    select 1 from public.tickets t
    where t.id=((storage.foldername(name))[2])::uuid
      and t.company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  )
);

drop policy if exists faxtrix_ticket_files_select on storage.objects;
create policy faxtrix_ticket_files_select
on storage.objects for select to authenticated
using (
  bucket_id='faxtrix-tickets'
  and (storage.foldername(name))[1] = (select p.company_id::text from public.profiles p where p.id=auth.uid())
  and exists (
    select 1 from public.tickets t
    where t.id=((storage.foldername(name))[2])::uuid
      and t.company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  )
);

drop policy if exists faxtrix_ticket_files_delete on storage.objects;
create policy faxtrix_ticket_files_delete
on storage.objects for delete to authenticated
using (
  bucket_id='faxtrix-tickets'
  and (storage.foldername(name))[1] = (select p.company_id::text from public.profiles p where p.id=auth.uid())
  and exists (
    select 1 from public.tickets t
    where t.id=((storage.foldername(name))[2])::uuid
      and t.company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  )
);

-- Statistiques globales visibles uniquement par INFOTELCOM dans le centre d'administration.
create or replace function public.infotelcom_platform_statistics()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'companies',(select count(*) from public.companies),
    'users',(select count(*) from public.profiles),
    'pending',(select count(*) from public.permission_requests where status='pending'),
    'audit',(select count(*) from public.admin_audit_logs),
    'tickets',(select count(*) from public.tickets),
    'clients',(select count(*) from public.clients),
    'missions',(select count(*) from public.terrain_missions),
    'team_members',(select count(*) from public.team_members),
    'automations',(select count(*) from public.automation_rules),
    'conversations',(select count(*) from public.chat_conversations),
    'messages',(select count(*) from public.chat_messages),
    'activity_events',(select count(*) from public.company_activity_events)
  )
  where public.is_infotelcom_admin();
$$;

revoke all on function public.infotelcom_platform_statistics() from public;
revoke all on function public.infotelcom_platform_statistics() from anon;
grant execute on function public.infotelcom_platform_statistics() to authenticated;

-- Tableau de bord analytique complet de l'entreprise.
create or replace function public.my_company_analytics()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select company_id from public.profiles where id=auth.uid()
  ),
  daily as (
    select to_char(date_trunc('day',e.created_at),'DD/MM') label,
           count(*)::int count
    from public.company_activity_events e, me
    where e.company_id=me.company_id
      and e.created_at >= now()-interval '30 days'
    group by 1, date_trunc('day',e.created_at)
    order by date_trunc('day',e.created_at)
  ),
  sessions as (
    select s.id,s.user_id,p.full_name,p.role,s.login_at,s.logout_at,s.last_seen_at,
           greatest(0,extract(epoch from (coalesce(s.logout_at,s.last_seen_at)-s.login_at)))::int duration_seconds
    from public.company_session_events s
    join public.profiles p on p.id=s.user_id
    join me on me.company_id=s.company_id
    where s.login_at >= now()-interval '30 days'
    order by s.login_at desc
    limit 500
  ),
  people as (
    select p.id,p.full_name,p.role,
      (select count(*) from public.company_session_events s where s.user_id=p.id and s.login_at>=now()-interval '30 days')::int sessions_30d,
      coalesce((select sum(greatest(0,extract(epoch from (coalesce(s.logout_at,s.last_seen_at)-s.login_at)))::bigint) from public.company_session_events s where s.user_id=p.id and s.login_at>=now()-interval '30 days'),0)::bigint connection_seconds_30d
    from public.profiles p, me
    where p.company_id=me.company_id
    order by p.full_name nulls last
  )
  select jsonb_build_object(
    'totals',jsonb_build_object(
      'clients',(select count(*) from public.clients c,me where c.company_id=me.company_id),
      'tickets',(select count(*) from public.tickets t,me where t.company_id=me.company_id),
      'missions',(select count(*) from public.terrain_missions m,me where m.company_id=me.company_id),
      'team',(select count(*) from public.team_members tm,me where tm.company_id=me.company_id),
      'automations',(select count(*) from public.automation_rules a,me where a.company_id=me.company_id),
      'conversations',(select count(*) from public.chat_conversations c,me where c.company_id=me.company_id),
      'messages',(select count(*) from public.chat_messages m,me where m.company_id=me.company_id),
      'activities',(select count(*) from public.company_activity_events e,me where e.company_id=me.company_id),
      'attachments',(select count(*) from public.ticket_attachments a,me where a.company_id=me.company_id)
    ),
    'daily_activity',coalesce((select jsonb_agg(to_jsonb(d)) from daily d),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from sessions s),'[]'::jsonb),
    'people',coalesce((select jsonb_agg(to_jsonb(p)) from people p),'[]'::jsonb)
  );
$$;

revoke all on function public.my_company_analytics() from public;
revoke all on function public.my_company_analytics() from anon;
grant execute on function public.my_company_analytics() to authenticated;
