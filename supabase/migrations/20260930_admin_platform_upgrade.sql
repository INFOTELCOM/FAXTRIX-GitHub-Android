-- Extension de l'administration centrale INFOTELCOM/FAXTRIX
create or replace function public.infotelcom_platform_statistics()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v jsonb;
begin
  if not public.is_infotelcom_admin() then raise exception 'Accès administrateur INFOTELCOM refusé'; end if;

  select jsonb_build_object(
    'companies', (select count(*) from public.companies),
    'users', (select count(*) from public.profiles),
    'clients', (select count(*) from public.clients),
    'tickets', (select count(*) from public.tickets),
    'missions', (select count(*) from public.terrain_missions),
    'team_members', (select count(*) from public.team_members),
    'automations', (select count(*) from public.automation_rules),
    'conversations', (select count(*) from public.chat_conversations),
    'messages', (select count(*) from public.chat_messages),
    'activity_events', (select count(*) from public.company_activity_events),
    'permission_requests_pending', (select count(*) from public.permission_requests where status='pending')
  ) into v;
  return v;
end;
$$;

revoke all on function public.infotelcom_platform_statistics() from public;
grant execute on function public.infotelcom_platform_statistics() to authenticated;

-- Ajouter les nouveaux modules à l'export central administrateur.
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
    'automation_rules', coalesce((select jsonb_agg(to_jsonb(x)) from public.automation_rules x where x.company_id=p_company_id),'[]'::jsonb),
    'chat_conversations', coalesce((select jsonb_agg(to_jsonb(x)) from public.chat_conversations x where x.company_id=p_company_id),'[]'::jsonb),
    'chat_members', coalesce((select jsonb_agg(to_jsonb(x)) from public.chat_members x where x.company_id=p_company_id),'[]'::jsonb),
    'chat_messages', coalesce((select jsonb_agg(to_jsonb(x)) from public.chat_messages x where x.company_id=p_company_id),'[]'::jsonb)
  ) into result;

  insert into public.admin_audit_logs(admin_id,company_id,action,target_type,target_id)
  values(auth.uid(),p_company_id,'company_export','company',p_company_id::text);
  return result;
end;
$$;

revoke all on function public.infotelcom_export_company(uuid) from public;
grant execute on function public.infotelcom_export_company(uuid) to authenticated;