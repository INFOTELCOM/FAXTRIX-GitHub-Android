-- FAXTRIX — réparation messagerie après erreur SQL AS $
-- Exécuter une seule fois dans Supabase SQL Editor.

create or replace function public.my_company_chat_profiles()
returns table(id uuid, full_name text, role text, avatar_url text, avatar_path text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.full_name, p.role, p.avatar_url, p.avatar_path
  from public.profiles p
  where p.company_id = (
    select company_id from public.profiles where id = auth.uid()
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

  select company_id into me_company
  from public.profiles
  where id = auth.uid();

  select company_id into target_company
  from public.profiles
  where id = p_user_id;

  if me_company is null or target_company is null or me_company <> target_company then
    raise exception 'Cette personne ne fait pas partie de votre entreprise';
  end if;

  select c.id into cid
  from public.chat_conversations c
  join public.chat_members m1 on m1.conversation_id = c.id and m1.user_id = auth.uid()
  join public.chat_members m2 on m2.conversation_id = c.id and m2.user_id = p_user_id
  where c.company_id = me_company
    and c.is_group = false
  limit 1;

  if cid is not null then
    return cid;
  end if;

  cid := gen_random_uuid();

  insert into public.chat_conversations
    (id, company_id, created_by, title, is_group, created_at, updated_at)
  values
    (cid, me_company, auth.uid(), null, false, now(), now());

  insert into public.chat_members
    (conversation_id, user_id, company_id, role)
  values
    (cid, auth.uid(), me_company, 'admin'),
    (cid, p_user_id, me_company, 'member');

  return cid;
end;
$$;

revoke all on function public.start_chat_conversation(uuid) from public;
grant execute on function public.start_chat_conversation(uuid) to authenticated;
