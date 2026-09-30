-- FAXTRIX — accès sécurisé aux profils pour la messagerie interne
-- Les utilisateurs ne peuvent voir que les profils de leur propre entreprise.

create or replace function public.my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_company_id() from public;
grant execute on function public.my_company_id() to authenticated;

drop policy if exists chat_profiles_select_same_company on public.profiles;
create policy chat_profiles_select_same_company
on public.profiles
for select
to authenticated
using (
  company_id = public.my_company_id()
);
