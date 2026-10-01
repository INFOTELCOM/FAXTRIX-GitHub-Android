-- FAXTRIX — correctif messagerie 2026-10-01
-- À exécuter dans Supabase SQL Editor.
-- Cette migration corrige le dollar-quoting du correctif précédent.
-- Elle crée les RPC nécessaires à "Démarrer une conversation".

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

create or replace function public.my_company_chat_profiles()
returns table(
  id uuid,
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
    p.full_name,
    p.role,
    p.avatar_url,
    p.avatar_path
  from public.profiles p
  where p.company_id = (
    select me.company_id
    from public.profiles me
    where me.id = auth.uid()
  )
  order by p.full_name;
$$;

revoke all on function public.my_company_chat_profiles() from public;
grant execute on function public.my_company_chat_profiles() to authenticated;

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

  select company_id
    into me_company
  from public.profiles
  where id = auth.uid();

  select company_id
    into target_company
  from public.profiles
  where id = p_user_id;

  if me_company is null then
    raise exception 'Votre profil entreprise est introuvable';
  end if;

  if target_company is null or me_company <> target_company then
    raise exception 'Cette personne ne fait pas partie de votre entreprise';
  end if;

  insert into public.chat_conversations(
    id, company_id, created_by, title, is_group, created_at, updated_at
  )
  values (
    cid, me_company, auth.uid(), null, false, now(), now()
  );

  insert into public.chat_members(
    conversation_id, user_id, company_id, role
  )
  values
    (cid, auth.uid(), me_company, 'admin'),
    (cid, p_user_id, me_company, 'member');

  return cid;
end;
$$;

revoke all on function public.start_chat_conversation(uuid) from public;
grant execute on function public.start_chat_conversation(uuid) to authenticated;

-- Vérification pratique après exécution :
-- select proname from pg_proc
-- where proname in ('my_company_chat_profiles','start_chat_conversation');
