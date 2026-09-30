-- FAXTRIX — statistiques de suivi et journal d'activité par entreprise
-- Lecture seule côté entreprise. Les événements sont générés automatiquement par PostgreSQL.

create table if not exists public.company_activity_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid null,
  entity_type text not null,
  action text not null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists company_activity_events_company_created_idx
  on public.company_activity_events(company_id, created_at desc);

alter table public.company_activity_events enable row level security;

drop policy if exists company_activity_events_no_client_write on public.company_activity_events;
create policy company_activity_events_no_client_write
  on public.company_activity_events
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

revoke all on public.company_activity_events from anon, authenticated, public;

create or replace function public.log_company_activity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company uuid;
  v_entity uuid;
  v_action text;
begin
  if TG_OP = 'DELETE' then
    v_company := OLD.company_id;
    v_entity := OLD.id;
    v_action := 'deleted';
  elsif TG_OP = 'UPDATE' then
    v_company := NEW.company_id;
    v_entity := NEW.id;
    v_action := 'updated';
  else
    v_company := NEW.company_id;
    v_entity := NEW.id;
    v_action := 'created';
  end if;

  if v_company is not null then
    insert into public.company_activity_events(company_id,actor_id,entity_type,action,entity_id,metadata)
    values(
      v_company,
      auth.uid(),
      TG_TABLE_NAME,
      v_action,
      v_entity,
      jsonb_build_object('table',TG_TABLE_NAME,'operation',TG_OP)
    );
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists faxtrix_activity_clients on public.clients;
create trigger faxtrix_activity_clients
after insert or update or delete on public.clients
for each row execute function public.log_company_activity();

drop trigger if exists faxtrix_activity_tickets on public.tickets;
create trigger faxtrix_activity_tickets
after insert or update or delete on public.tickets
for each row execute function public.log_company_activity();

drop trigger if exists faxtrix_activity_terrain on public.terrain_missions;
create trigger faxtrix_activity_terrain
after insert or update or delete on public.terrain_missions
for each row execute function public.log_company_activity();

drop trigger if exists faxtrix_activity_team on public.team_members;
create trigger faxtrix_activity_team
after insert or update or delete on public.team_members
for each row execute function public.log_company_activity();

drop trigger if exists faxtrix_activity_automation on public.automation_rules;
create trigger faxtrix_activity_automation
after insert or update or delete on public.automation_rules
for each row execute function public.log_company_activity();

create or replace function public.build_company_statistics(p_company_id uuid)
returns jsonb
language sql
security definer
set search_path=''
stable
as $$
  select jsonb_build_object(
    'company_id', p_company_id,
    'clients_total', (select count(*) from public.clients where company_id=p_company_id),
    'clients_active', (select count(*) from public.clients where company_id=p_company_id and statut='Actif'),
    'pipeline_value', coalesce((select sum(coalesce(valeur,0)) from public.clients where company_id=p_company_id),0),
    'tickets_total', (select count(*) from public.tickets where company_id=p_company_id),
    'tickets_open', (select count(*) from public.tickets where company_id=p_company_id and statut not in ('Résolu','Fermé')),
    'tickets_resolved', (select count(*) from public.tickets where company_id=p_company_id and statut in ('Résolu','Fermé')),
    'missions_total', (select count(*) from public.terrain_missions where company_id=p_company_id),
    'missions_active', (select count(*) from public.terrain_missions where company_id=p_company_id and statut='En cours'),
    'missions_completed', (select count(*) from public.terrain_missions where company_id=p_company_id and statut='Terminée'),
    'team_total', (select count(*) from public.team_members where company_id=p_company_id),
    'team_available', (select count(*) from public.team_members where company_id=p_company_id and statut='Disponible'),
    'automations_total', (select count(*) from public.automation_rules where company_id=p_company_id),
    'automations_live', (select count(*) from public.automation_rules where company_id=p_company_id and live=true),
    'activity_total', (select count(*) from public.company_activity_events where company_id=p_company_id),
    'last_activity_at', (select max(created_at) from public.company_activity_events where company_id=p_company_id),
    'recent_activity', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',e.id,
          'action',e.action,
          'entity_type',e.entity_type,
          'entity_id',e.entity_id,
          'created_at',e.created_at,
          'actor_id',e.actor_id
        ) order by e.created_at desc
      )
      from (
        select *
        from public.company_activity_events
        where company_id=p_company_id
        order by created_at desc
        limit 20
      ) e
    ),'[]'::jsonb),
    'daily_activity', coalesce((
      select jsonb_agg(
        jsonb_build_object('label',to_char(d.day,'DD/MM'),'count',coalesce(x.n,0))
        order by d.day
      )
      from generate_series(
        current_date - interval '13 days',
        current_date,
        interval '1 day'
      ) d(day)
      left join (
        select date_trunc('day',created_at)::date day,count(*) n
        from public.company_activity_events
        where company_id=p_company_id
          and created_at >= current_date - interval '13 days'
        group by 1
      ) x on x.day=d.day::date
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.build_company_statistics(uuid) from public, anon, authenticated;

create or replace function public.my_company_statistics()
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_company uuid;
begin
  select company_id into v_company
  from public.profiles
  where id=auth.uid();

  if v_company is null then
    raise exception 'Entreprise introuvable';
  end if;

  return public.build_company_statistics(v_company);
end;
$$;

create or replace function public.infotelcom_company_statistics(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
begin
  if not public.is_infotelcom_admin() then
    raise exception 'Accès administrateur INFOTELCOM refusé';
  end if;

  if not exists(select 1 from public.companies where id=p_company_id) then
    raise exception 'Entreprise introuvable';
  end if;

  return public.build_company_statistics(p_company_id);
end;
$$;

revoke all on function public.my_company_statistics() from public, anon;
revoke all on function public.infotelcom_company_statistics(uuid) from public, anon;
grant execute on function public.my_company_statistics() to authenticated;
grant execute on function public.infotelcom_company_statistics(uuid) to authenticated;
