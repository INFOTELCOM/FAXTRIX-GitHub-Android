-- FAXTRIX — correctif messagerie : création et lecture de conversation
-- Ne modifie pas les droits CRM/tickets/terrain/etc.

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

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select
on public.chat_conversations
for select to authenticated
using (
  public.is_chat_member(id, auth.uid())
  or created_by = auth.uid()
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
    public.is_chat_member(conversation_id, auth.uid())
    or exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and c.created_by = auth.uid()
        and c.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  )
);

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select
on public.chat_messages
for select to authenticated
using (public.is_chat_member(conversation_id, auth.uid()));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert
on public.chat_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  and public.is_chat_member(conversation_id, auth.uid())
);

create index if not exists chat_conversations_company_updated_idx
  on public.chat_conversations(company_id, updated_at desc);

create index if not exists chat_members_conversation_user_idx
  on public.chat_members(conversation_id, user_id);
