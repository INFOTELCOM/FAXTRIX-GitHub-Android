-- FAXTRIX — upgrade opérationnel CRM / tickets / terrain / rapports
-- Ajoute des champs professionnels sans casser les données existantes.

alter table public.tickets
  add column if not exists categorie text not null default 'Général',
  add column if not exists description text,
  add column if not exists assigned_to text,
  add column if not exists due_at timestamptz,
  add column if not exists resolved_at timestamptz;

alter table public.terrain_missions
  add column if not exists adresse text,
  add column if not exists notes text,
  add column if not exists compte_rendu text;

create index if not exists tickets_company_status_idx
  on public.tickets(company_id, statut);

create index if not exists tickets_company_priority_idx
  on public.tickets(company_id, priorite);

create index if not exists tickets_company_due_idx
  on public.tickets(company_id, due_at);

create index if not exists terrain_company_status_idx
  on public.terrain_missions(company_id, statut);

-- Les champs restent protégés par les politiques RLS déjà présentes.


-- Horodatage complet des interventions terrain.
alter table public.terrain_missions
  add column if not exists completed_at timestamptz;

create or replace function public.sync_terrain_completed_at()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.statut = 'Terminée' and old.statut is distinct from new.statut then
    new.completed_at := coalesce(new.completed_at, now());
    if new.started_at is not null then
      new.elapsed_ms := greatest(
        coalesce(new.elapsed_ms,0),
        floor(extract(epoch from (new.completed_at-new.started_at))*1000)::bigint
      );
    end if;
  elsif new.statut <> 'Terminée' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_terrain_completed_at on public.terrain_missions;
create trigger trg_sync_terrain_completed_at
before update on public.terrain_missions
for each row execute function public.sync_terrain_completed_at();

create index if not exists terrain_company_completed_idx
on public.terrain_missions(company_id, completed_at desc);

-- Dernière sauvegarde automatique d'un ticket.
create or replace function public.sync_ticket_last_saved()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.last_autosaved_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_ticket_last_saved on public.tickets;
create trigger trg_sync_ticket_last_saved
before update on public.tickets
for each row execute function public.sync_ticket_last_saved();


-- FAXTRIX — messagerie interne entreprise
-- Conversations privées/groupes, messages, fichiers et présence.
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_path text;

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text,
  avatar_url text,
  is_group boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id,user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  message_type text not null default 'text' check (message_type in ('text','file','image','audio','video','system')),
  file_name text,
  file_path text,
  file_size bigint,
  mime_type text,
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists chat_members_user_idx on public.chat_members(user_id, conversation_id);
create index if not exists chat_messages_conversation_idx on public.chat_messages(conversation_id, created_at);
create index if not exists chat_messages_company_idx on public.chat_messages(company_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations
for select to authenticated using (
  exists (select 1 from public.chat_members m where m.conversation_id=id and m.user_id=auth.uid())
);

drop policy if exists chat_conversations_insert on public.chat_conversations;
create policy chat_conversations_insert on public.chat_conversations
for insert to authenticated with check (
  created_by=auth.uid()
  and company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
);

drop policy if exists chat_conversations_update on public.chat_conversations;
create policy chat_conversations_update on public.chat_conversations
for update to authenticated using (
  exists (select 1 from public.chat_members m where m.conversation_id=id and m.user_id=auth.uid())
) with check (
  exists (select 1 from public.chat_members m where m.conversation_id=id and m.user_id=auth.uid())
);

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members
for select to authenticated using (
  exists (select 1 from public.chat_members x where x.conversation_id=conversation_id and x.user_id=auth.uid())
);

drop policy if exists chat_members_insert on public.chat_members;
create policy chat_members_insert on public.chat_members
for insert to authenticated with check (
  company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  and exists (select 1 from public.chat_members x where x.conversation_id=conversation_id and x.user_id=auth.uid())
  or (
    company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
    and exists (select 1 from public.chat_conversations c where c.id=conversation_id and c.created_by=auth.uid())
  )
);

drop policy if exists chat_members_update on public.chat_members;
create policy chat_members_update on public.chat_members
for update to authenticated using (user_id=auth.uid())
with check (user_id=auth.uid());

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
for select to authenticated using (
  exists (select 1 from public.chat_members m where m.conversation_id=chat_messages.conversation_id and m.user_id=auth.uid())
);

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
for insert to authenticated with check (
  sender_id=auth.uid()
  and company_id=(select p.company_id from public.profiles p where p.id=auth.uid())
  and exists (select 1 from public.chat_members m where m.conversation_id=chat_messages.conversation_id and m.user_id=auth.uid())
);

drop policy if exists chat_messages_update on public.chat_messages;
create policy chat_messages_update on public.chat_messages
for update to authenticated using (sender_id=auth.uid())
with check (sender_id=auth.uid());

-- Stockage privé des pièces jointes et avatars.
insert into storage.buckets (id,name,public)
values ('faxtrix-chat','faxtrix-chat',false),('faxtrix-avatars','faxtrix-avatars',false)
on conflict (id) do update set public=excluded.public;

drop policy if exists faxtrix_chat_objects_select on storage.objects;
create policy faxtrix_chat_objects_select on storage.objects
for select to authenticated using (
  bucket_id='faxtrix-chat'
  and exists (
    select 1 from public.chat_members m
    where m.conversation_id=(storage.foldername(name))[2]::uuid
      and m.user_id=auth.uid()
  )
);

drop policy if exists faxtrix_chat_objects_insert on storage.objects;
create policy faxtrix_chat_objects_insert on storage.objects
for insert to authenticated with check (
  bucket_id='faxtrix-chat'
  and exists (
    select 1 from public.chat_members m
    where m.conversation_id=(storage.foldername(name))[2]::uuid
      and m.user_id=auth.uid()
  )
);

drop policy if exists faxtrix_chat_objects_delete on storage.objects;
create policy faxtrix_chat_objects_delete on storage.objects
for delete to authenticated using (
  bucket_id='faxtrix-chat'
  and owner_id::uuid=auth.uid()
);

drop policy if exists faxtrix_avatar_objects_select on storage.objects;
create policy faxtrix_avatar_objects_select on storage.objects
for select to authenticated using (
  bucket_id='faxtrix-avatars'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists faxtrix_avatar_objects_insert on storage.objects;
create policy faxtrix_avatar_objects_insert on storage.objects
for insert to authenticated with check (
  bucket_id='faxtrix-avatars'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists faxtrix_avatar_objects_update on storage.objects;
create policy faxtrix_avatar_objects_update on storage.objects
for update to authenticated using (
  bucket_id='faxtrix-avatars' and (storage.foldername(name))[1]=auth.uid()::text
) with check (
  bucket_id='faxtrix-avatars' and (storage.foldername(name))[1]=auth.uid()::text
);

-- Realtime pour la messagerie.
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end $$;


-- Correction RLS messagerie : évite la récursion de chat_members.
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
    select 1 from public.chat_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = p_user_id
  );
$$;

revoke all on function public.is_chat_member(uuid, uuid) from public;
grant execute on function public.is_chat_member(uuid, uuid) to authenticated;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations
for select to authenticated
using (public.is_chat_member(id, auth.uid()));

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members
for select to authenticated
using (user_id = auth.uid() or public.is_chat_member(conversation_id, auth.uid()));

drop policy if exists chat_members_insert on public.chat_members;
create policy chat_members_insert on public.chat_members
for insert to authenticated
with check (
  company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  and (
    public.is_chat_member(conversation_id, auth.uid())
    or exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id
        and c.created_by = auth.uid()
        and c.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  )
);

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
for select to authenticated
using (public.is_chat_member(conversation_id, auth.uid()));

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
  and public.is_chat_member(conversation_id, auth.uid())
);

drop policy if exists chat_conversations_delete on public.chat_conversations;
create policy chat_conversations_delete on public.chat_conversations
for delete to authenticated
using (created_by = auth.uid());
