-- FAXTRIX — INFOTELCOM identity, admin directory and chat hardening
-- Applied to production on 2026-10-02.

update public.companies set name='INFOTELCOM' where lower(name)='mon entreprise';
update public.companies set name='DEMO FAXTRIX' where lower(name)='stostep';

update public.profiles set full_name='ALBERT MAYELE'
where id='cfc2d567-2562-4a95-ae44-af34a0b90ea4';

create table if not exists public.infotelcom_admin_directory(
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  login_email text not null unique,
  display_email text not null default 'contact.infotelcom@gmail.com',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.infotelcom_admin_directory enable row level security;
drop policy if exists infotelcom_admin_directory_read on public.infotelcom_admin_directory;
create policy infotelcom_admin_directory_read on public.infotelcom_admin_directory
for select to authenticated using (public.is_infotelcom_admin());
revoke all on public.infotelcom_admin_directory from anon;
grant select on public.infotelcom_admin_directory to authenticated;

insert into public.infotelcom_admin_directory(full_name,login_email,display_email) values
('ALBERT MAYELE','contact.infotelcom@gmail.com','contact.infotelcom@gmail.com'),
('CHRIST MAWANA','contact.infotelcom+christ@gmail.com','contact.infotelcom@gmail.com'),
('JUVEL NGALIKO','contact.infotelcom+juvel@gmail.com','contact.infotelcom@gmail.com')
on conflict(login_email) do update set full_name=excluded.full_name,display_email=excluded.display_email,active=true;

drop function if exists public.my_company_chat_profiles();
create function public.my_company_chat_profiles()
returns table(id uuid,full_name text,role text,avatar_url text,avatar_path text,company_id uuid)
language sql stable security definer set search_path=public,pg_temp
as $$
  select p.id,p.full_name,p.role,p.avatar_url,p.avatar_path,p.company_id
  from public.profiles p
  where p.company_id=(select me.company_id from public.profiles me where me.id=auth.uid())
  order by p.full_name nulls last;
$$;
revoke all on function public.my_company_chat_profiles() from public;
revoke execute on function public.my_company_chat_profiles() from anon;
grant execute on function public.my_company_chat_profiles() to authenticated;

create or replace function public.infotelcom_platform_statistics()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.is_infotelcom_admin() then raise exception 'Accès administrateur INFOTELCOM refusé'; end if;
  return jsonb_build_object(
    'companies',(select count(*) from public.companies),
    'users',(select count(*) from public.profiles),
    'clients',(select count(*) from public.clients),
    'tickets',(select count(*) from public.tickets),
    'missions',(select count(*) from public.terrain_missions),
    'team_members',(select count(*) from public.team_members),
    'automations',(select count(*) from public.automation_rules),
    'conversations',(select count(*) from public.chat_conversations),
    'messages',(select count(*) from public.chat_messages),
    'activity_events',(select count(*) from public.company_activity_events)
  );
end;
$$;
revoke all on function public.infotelcom_platform_statistics() from public;
grant execute on function public.infotelcom_platform_statistics() to authenticated;
grant execute on function public.start_chat_conversation(uuid) to authenticated;

notify pgrst,'reload schema';
