-- FAXTRIX — correctif final messagerie interne
-- À exécuter une fois dans Supabase SQL Editor.
-- Corrige les lectures récursives RLS et autorise proprement le créateur
-- à créer les membres avant l'envoi du premier message.

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
  select exists (
    select 1
    from public.chat_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = p_user_id
  );
$$;

revoke all on function public.is_chat_member(uuid, uuid) from public;
grant execute on function public.is_chat_member(uuid, uuid) to authenticated;

-- Permet à un utilisateur authentifié de rechercher les membres de sa propre entreprise
-- sans exposer les profils des autres organisations.
create or replace function public.my_company_chat_profiles()
returns table(id uuid, full_name text, role text, avatar_url text, avatar_path text)
language sql
stable
security definer
set search_path = public, pg_temp
as $
  select p.id, p.full_name, p.role, p.avatar_url, p.avatar_path
  from public.profiles p
  where p.company_id = (select company_id from public.profiles where id = auth.uid())
  order by p.full_name;
$;
revoke all on function public.my_company_chat_profiles() from public;
grant execute on function public.my_company_chat_profiles() to authenticated;

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select
on public.chat_conversations
for select to authenticated
using (
  created_by = auth.uid()
  or public.is_chat_member(id, auth.uid())
);

drop policy if exists chat_conversations_insert on public.chat_conversations;
create policy chat_conversations_insert
on public.chat_conversations
for insert to authenticated
with check (
  created_by = auth.uid()
  and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists chat_conversations_update on public.chat_conversations;
create policy chat_conversations_update
on public.chat_conversations
for update to authenticated
using (public.is_chat_member(id, auth.uid()))
with check (
  company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  and public.is_chat_member(id, auth.uid())
);

drop policy if exists chat_conversations_delete on public.chat_conversations;
create policy chat_conversations_delete
on public.chat_conversations
for delete to authenticated
using (
  created_by = auth.uid()
  or public.is_chat_member(id, auth.uid())
);

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select
on public.chat_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_chat_member(conversation_id, auth.uid())
);

drop policy if exists chat_members_insert on public.chat_members;
create policy chat_members_insert
on public.chat_members
for insert to authenticated
with check (
  company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  and (
    user_id = auth.uid()
    or public.is_chat_member(conversation_id, auth.uid())
    or exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and c.created_by = auth.uid()
        and c.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  )
);

drop policy if exists chat_members_update on public.chat_members;
create policy chat_members_update
on public.chat_members
for update to authenticated
using (user_id = auth.uid() or public.is_chat_member(conversation_id, auth.uid()))
with check (
  company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists chat_members_delete on public.chat_members;
create policy chat_members_delete
on public.chat_members
for delete to authenticated
using (
  user_id = auth.uid()
  or public.is_chat_member(conversation_id, auth.uid())
);

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select
on public.chat_messages
for select to authenticated
using (
  public.is_chat_member(conversation_id, auth.uid())
);

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert
on public.chat_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  and public.is_chat_member(conversation_id, auth.uid())
);

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update
on public.chat_messages
for update to authenticated
using (sender_id = auth.uid())
with check (
  sender_id = auth.uid()
  and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  and public.is_chat_member(conversation_id, auth.uid())
);

drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete
on public.chat_messages
for delete to authenticated
using (sender_id = auth.uid());

create index if not exists chat_conversations_company_updated_idx
  on public.chat_conversations(company_id, updated_at desc);

create index if not exists chat_members_conversation_user_idx
  on public.chat_members(conversation_id, user_id);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages(conversation_id, created_at);

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end $$;


-- Création atomique d'une conversation privée.
-- Le contrôle d'entreprise est effectué côté serveur afin que le client
-- ne puisse créer une conversation qu'avec un utilisateur de sa propre entreprise.
create or replace function public.start_chat_conversation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me_company uuid;
  target_company uuid;
  cid uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non authentifié';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Destinataire invalide';
  end if;

  select company_id into me_company from public.profiles where id = auth.uid();
  select company_id into target_company from public.profiles where id = p_user_id;

  if me_company is null or target_company is null or me_company <> target_company then
    raise exception 'Cette personne ne fait pas partie de votre entreprise';
  end if;

  insert into public.chat_conversations(id, company_id, created_by, title, is_group, created_at, updated_at)
  values (cid, me_company, auth.uid(), null, false, now(), now());

  insert into public.chat_members(conversation_id, user_id, company_id, role)
  values
    (cid, auth.uid(), me_company, 'admin'),
    (cid, p_user_id, me_company, 'member');

  return cid;
end;
$$;

revoke all on function public.start_chat_conversation(uuid) from public;
grant execute on function public.start_chat_conversation(uuid) to authenticated;
