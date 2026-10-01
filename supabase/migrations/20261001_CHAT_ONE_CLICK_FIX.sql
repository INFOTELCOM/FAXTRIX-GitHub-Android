-- FAXTRIX — ONE CLICK FIX MESSAGERIE
-- Exécuter uniquement ce fichier si la base affiche 42P13 sur my_company_chat_profiles().
-- Il supprime l'ancienne signature avant de la recréer avec company_id.
-- FAXTRIX — RPC messagerie canonique (2026-10-01)
-- Exécuter cette migration après les anciennes versions.
-- IMPORTANT : on supprime explicitement l'ancienne signature avant de
-- recréer le RPC, car PostgreSQL refuse de modifier les OUT parameters.

drop function if exists public.my_company_chat_profiles();

create function public.my_company_chat_profiles()
returns table(
  id uuid,
  company_id uuid,
  full_name text,
  role text,
  avatar_url text,
  avatar_path text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.company_id,
    p.full_name,
    p.role,
    p.avatar_url,
    p.avatar_path
  from public.profiles p
  where auth.uid() is not null
    and p.company_id = (
      select me.company_id
      from public.profiles me
      where me.id = auth.uid()
      limit 1
    )
  order by lower(coalesce(p.full_name,'')), p.id;
$$;

revoke all on function public.my_company_chat_profiles() from public;
grant execute on function public.my_company_chat_profiles() to authenticated;

create or replace function public.is_chat_member(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.chat_members m
    where m.conversation_id=p_conversation_id
      and m.user_id=p_user_id
  );
$$;

revoke all on function public.is_chat_member(uuid, uuid) from public;
grant execute on function public.is_chat_member(uuid, uuid) to authenticated;

drop function if exists public.start_chat_conversation(uuid);

create function public.start_chat_conversation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me_company uuid;
  target_company uuid;
  existing_id uuid;
  cid uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non authentifié';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Destinataire invalide';
  end if;

  select company_id into me_company from public.profiles where id=auth.uid();
  select company_id into target_company from public.profiles where id=p_user_id;

  if me_company is null then
    raise exception 'Votre profil FAXTRIX n''est pas rattaché à une entreprise';
  end if;
  if target_company is null or target_company <> me_company then
    raise exception 'Cette personne ne fait pas partie de votre entreprise';
  end if;

  select c.id into existing_id
  from public.chat_conversations c
  where c.company_id=me_company
    and c.is_group=false
    and (
      select count(*) from public.chat_members m
      where m.conversation_id=c.id
        and m.user_id in(auth.uid(),p_user_id)
    )=2
    and (
      select count(*) from public.chat_members m
      where m.conversation_id=c.id
    )=2
  order by c.updated_at desc
  limit 1;

  if existing_id is not null then return existing_id; end if;

  insert into public.chat_conversations(id,company_id,created_by,title,is_group,created_at,updated_at)
  values(cid,me_company,auth.uid(),null,false,now(),now());

  insert into public.chat_members(conversation_id,user_id,company_id,role)
  values
    (cid,auth.uid(),me_company,'admin'),
    (cid,p_user_id,me_company,'member');

  return cid;
end;
$$;

revoke all on function public.start_chat_conversation(uuid) from public;
grant execute on function public.start_chat_conversation(uuid) to authenticated;

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations
for select to authenticated
using(created_by=auth.uid() or public.is_chat_member(id,auth.uid()));

drop policy if exists chat_conversations_insert on public.chat_conversations;
create policy chat_conversations_insert on public.chat_conversations
for insert to authenticated
with check(
  created_by=auth.uid()
  and company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
);

drop policy if exists chat_conversations_update on public.chat_conversations;
create policy chat_conversations_update on public.chat_conversations
for update to authenticated
using(public.is_chat_member(id,auth.uid()))
with check(
  company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  and public.is_chat_member(id,auth.uid())
);

drop policy if exists chat_conversations_delete on public.chat_conversations;
create policy chat_conversations_delete on public.chat_conversations
for delete to authenticated
using(created_by=auth.uid() or public.is_chat_member(id,auth.uid()));

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members
for select to authenticated
using(user_id=auth.uid() or public.is_chat_member(conversation_id,auth.uid()));

drop policy if exists chat_members_insert on public.chat_members;
create policy chat_members_insert on public.chat_members
for insert to authenticated
with check(
  company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  and (
    user_id=auth.uid()
    or public.is_chat_member(conversation_id,auth.uid())
    or exists(
      select 1 from public.chat_conversations c
      where c.id=conversation_id and c.created_by=auth.uid()
        and c.company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
    )
  )
);

drop policy if exists chat_members_update on public.chat_members;
create policy chat_members_update on public.chat_members
for update to authenticated
using(user_id=auth.uid() or public.is_chat_member(conversation_id,auth.uid()))
with check(company_id=(select p.company_id from public.profiles p where p.id=auth.uid()));

drop policy if exists chat_members_delete on public.chat_members;
create policy chat_members_delete on public.chat_members
for delete to authenticated
using(user_id=auth.uid() or public.is_chat_member(conversation_id,auth.uid()));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
for select to authenticated
using(public.is_chat_member(conversation_id,auth.uid()));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
for insert to authenticated
with check(
  sender_id=auth.uid()
  and company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  and public.is_chat_member(conversation_id,auth.uid())
);

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages
for update to authenticated
using(sender_id=auth.uid())
with check(
  sender_id=auth.uid()
  and company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  and public.is_chat_member(conversation_id,auth.uid())
);

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages
for delete to authenticated
using(sender_id=auth.uid());

create index if not exists chat_conversations_company_updated_idx on public.chat_conversations(company_id,updated_at desc);
create index if not exists chat_members_conversation_user_idx on public.chat_members(conversation_id,user_id);
create index if not exists chat_messages_conversation_created_idx on public.chat_messages(conversation_id,created_at);

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end;
$$;
