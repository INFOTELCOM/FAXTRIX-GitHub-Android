-- FAXTRIX — correctif final messagerie + provisioning utilisateurs INFOTELCOM
-- À appliquer après les migrations de messagerie existantes.

create extension if not exists pgcrypto;

-- Les comptes créés par INFOTELCOM portent company_id/role dans user_metadata.
-- Le trigger les rattache directement à la bonne entreprise.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_company_id uuid;
  company_name text;
  inv record;
  requested_role text;
begin
  begin
    new_company_id := nullif(new.raw_user_meta_data->>'company_id','')::uuid;
  exception when others then
    new_company_id := null;
  end;

  if new_company_id is not null
     and exists (select 1 from public.companies where id=new_company_id) then
    requested_role := coalesce(new.raw_user_meta_data->>'role','member');
    if requested_role not in ('owner','manager','commercial','technicien','lecture_seule','infotelcom_admin','member') then
      requested_role := 'member';
    end if;

    insert into public.profiles(id,company_id,full_name,role,phone)
    values(new.id,new_company_id,coalesce(new.raw_user_meta_data->>'full_name',''),requested_role,new.raw_user_meta_data->>'phone')
    on conflict(id) do update set
      company_id=excluded.company_id,
      full_name=excluded.full_name,
      role=excluded.role,
      phone=excluded.phone;

    insert into public.notifications(company_id,msg)
    values(new_company_id,coalesce(new.raw_user_meta_data->>'full_name',new.email)||' a été ajouté à l''équipe.');
    return new;
  end if;

  select * into inv
  from public.invitations
  where email=new.email and accepted=false
  order by created_at asc limit 1;

  if inv.id is not null then
    insert into public.profiles(id,company_id,full_name,role,phone)
    values(new.id,inv.company_id,coalesce(new.raw_user_meta_data->>'full_name',''),
           coalesce(nullif(new.raw_user_meta_data->>'role',''),'member'),
           new.raw_user_meta_data->>'phone')
    on conflict(id) do update set
      company_id=excluded.company_id,
      full_name=excluded.full_name,
      role=excluded.role,
      phone=excluded.phone;
    update public.invitations set accepted=true where id=inv.id;
    insert into public.notifications(company_id,msg)
    values(inv.company_id,coalesce(new.raw_user_meta_data->>'full_name',new.email)||' a rejoint l''équipe.');
    return new;
  end if;

  company_name:=coalesce(new.raw_user_meta_data->>'company_name','Mon entreprise');
  insert into public.companies(name,sector,company_size,country,city)
  values(company_name,new.raw_user_meta_data->>'sector',new.raw_user_meta_data->>'company_size',
         new.raw_user_meta_data->>'country',new.raw_user_meta_data->>'city')
  returning id into new_company_id;

  insert into public.profiles(id,company_id,full_name,role,phone)
  values(new.id,new_company_id,coalesce(new.raw_user_meta_data->>'full_name',''),'owner',new.raw_user_meta_data->>'phone');

  insert into public.notifications(company_id,msg)
  values(new_company_id,'Bienvenue sur FAXTRIX, '||company_name||' !');
  return new;
end;
$function$;

drop function if exists public.my_company_chat_profiles();

create function public.my_company_chat_profiles()
returns table(id uuid,full_name text,role text,avatar_url text,avatar_path text,company_id uuid)
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select p.id,p.full_name,p.role,p.avatar_url,p.avatar_path,p.company_id
  from public.profiles p
  where p.company_id=(select me.company_id from public.profiles me where me.id=auth.uid())
  order by p.full_name nulls last;
$function$;

revoke all on function public.my_company_chat_profiles() from public;
grant execute on function public.my_company_chat_profiles() to authenticated;

create or replace function public.is_chat_member(p_conversation_id uuid,p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select exists(select 1 from public.chat_members m where m.conversation_id=p_conversation_id and m.user_id=p_user_id);
$function$;

revoke all on function public.is_chat_member(uuid,uuid) from public;
grant execute on function public.is_chat_member(uuid,uuid) to authenticated;

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations for select to authenticated
using(created_by=auth.uid() or public.is_chat_member(id,auth.uid()));

drop policy if exists chat_conversations_insert on public.chat_conversations;
create policy chat_conversations_insert on public.chat_conversations for insert to authenticated
with check(created_by=auth.uid() and company_id=(select p.company_id from public.profiles p where p.id=auth.uid()));

drop policy if exists chat_conversations_update on public.chat_conversations;
create policy chat_conversations_update on public.chat_conversations for update to authenticated
using(public.is_chat_member(id,auth.uid()))
with check(company_id=(select p.company_id from public.profiles p where p.id=auth.uid()) and public.is_chat_member(id,auth.uid()));

drop policy if exists chat_conversations_delete on public.chat_conversations;
create policy chat_conversations_delete on public.chat_conversations for delete to authenticated
using(created_by=auth.uid() or public.is_chat_member(id,auth.uid()));

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members for select to authenticated
using(user_id=auth.uid() or public.is_chat_member(conversation_id,auth.uid()));

drop policy if exists chat_members_insert on public.chat_members;
create policy chat_members_insert on public.chat_members for insert to authenticated
with check(company_id=(select p.company_id from public.profiles p where p.id=auth.uid()) and
  (user_id=auth.uid() or public.is_chat_member(conversation_id,auth.uid()) or exists(
    select 1 from public.chat_conversations c
    where c.id=conversation_id and c.created_by=auth.uid()
      and c.company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  )));

drop policy if exists chat_members_update on public.chat_members;
create policy chat_members_update on public.chat_members for update to authenticated
using(user_id=auth.uid() or public.is_chat_member(conversation_id,auth.uid()))
with check(company_id=(select p.company_id from public.profiles p where p.id=auth.uid()));

drop policy if exists chat_members_delete on public.chat_members;
create policy chat_members_delete on public.chat_members for delete to authenticated
using(user_id=auth.uid() or public.is_chat_member(conversation_id,auth.uid()));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages for select to authenticated
using(public.is_chat_member(conversation_id,auth.uid()));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert to authenticated
with check(sender_id=auth.uid() and company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  and public.is_chat_member(conversation_id,auth.uid()));

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages for update to authenticated
using(sender_id=auth.uid())
with check(sender_id=auth.uid() and company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  and public.is_chat_member(conversation_id,auth.uid()));

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages for delete to authenticated
using(sender_id=auth.uid());

create or replace function public.start_chat_conversation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare me_company uuid; target_company uuid; cid uuid:=gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Utilisateur non authentifié'; end if;
  if p_user_id is null or p_user_id=auth.uid() then raise exception 'Destinataire invalide'; end if;
  select company_id into me_company from public.profiles where id=auth.uid();
  select company_id into target_company from public.profiles where id=p_user_id;
  if me_company is null or target_company is null or me_company<>target_company then
    raise exception 'Cette personne ne fait pas partie de votre entreprise';
  end if;
  insert into public.chat_conversations(id,company_id,created_by,title,is_group,created_at,updated_at)
  values(cid,me_company,auth.uid(),null,false,now(),now());
  insert into public.chat_members(conversation_id,user_id,company_id,role)
  values(cid,auth.uid(),me_company,'admin'),(cid,p_user_id,me_company,'member');
  return cid;
end;
$function$;

revoke all on function public.start_chat_conversation(uuid) from public;
grant execute on function public.start_chat_conversation(uuid) to authenticated;

create index if not exists chat_conversations_company_updated_idx on public.chat_conversations(company_id,updated_at desc);
create index if not exists chat_members_conversation_user_idx on public.chat_members(conversation_id,user_id);
create index if not exists chat_messages_conversation_created_idx on public.chat_messages(conversation_id,created_at);

do $function$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end
$function$;
