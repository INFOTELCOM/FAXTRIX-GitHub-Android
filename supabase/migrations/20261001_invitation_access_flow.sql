-- FAXTRIX — provisioning des accès par invitation
-- INFOTELCOM prépare l'accès ; l'utilisateur choisit son mot de passe à l'inscription.

alter table public.invitations
  add column if not exists full_name text,
  add column if not exists role text;

drop policy if exists "invitations: infotelcom admin manages" on public.invitations;
create policy "invitations: infotelcom admin manages"
on public.invitations for all to authenticated
using ((select public.is_infotelcom_admin()))
with check ((select public.is_infotelcom_admin()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  new_company_id uuid;
  company_name text;
  inv record;
  requested_role text;
begin
  begin
    new_company_id:=nullif(new.raw_user_meta_data->>'company_id','')::uuid;
  exception when others then new_company_id:=null;
  end;

  if new_company_id is not null and exists(select 1 from public.companies where id=new_company_id) then
    requested_role:=coalesce(new.raw_user_meta_data->>'role','member');
    if requested_role not in ('owner','manager','commercial','technicien','lecture_seule','infotelcom_admin','member') then requested_role:='member'; end if;
    insert into public.profiles(id,company_id,full_name,role,phone)
    values(new.id,new_company_id,coalesce(new.raw_user_meta_data->>'full_name',''),requested_role,new.raw_user_meta_data->>'phone')
    on conflict(id) do update set company_id=excluded.company_id,full_name=excluded.full_name,role=excluded.role,phone=excluded.phone;
    insert into public.notifications(company_id,msg) values(new_company_id,coalesce(new.raw_user_meta_data->>'full_name',new.email)||' a été ajouté à l''équipe.');
    return new;
  end if;

  select * into inv from public.invitations
  where lower(email)=lower(new.email) and accepted=false
  order by created_at asc limit 1;

  if inv.id is not null then
    requested_role:=coalesce(inv.role,nullif(new.raw_user_meta_data->>'role',''),'member');
    if requested_role not in ('owner','manager','commercial','technicien','lecture_seule','infotelcom_admin','member') then requested_role:='member'; end if;
    insert into public.profiles(id,company_id,full_name,role,phone)
    values(new.id,inv.company_id,coalesce(inv.full_name,new.raw_user_meta_data->>'full_name',''),requested_role,new.raw_user_meta_data->>'phone')
    on conflict(id) do update set company_id=excluded.company_id,full_name=excluded.full_name,role=excluded.role,phone=excluded.phone;
    update public.invitations set accepted=true where id=inv.id;
    insert into public.notifications(company_id,msg) values(inv.company_id,coalesce(inv.full_name,new.email)||' a rejoint l''équipe.');
    return new;
  end if;

  company_name:=coalesce(new.raw_user_meta_data->>'company_name','Mon entreprise');
  insert into public.companies(name,sector,company_size,country,city)
  values(company_name,new.raw_user_meta_data->>'sector',new.raw_user_meta_data->>'company_size',new.raw_user_meta_data->>'country',new.raw_user_meta_data->>'city')
  returning id into new_company_id;
  insert into public.profiles(id,company_id,full_name,role,phone)
  values(new.id,new_company_id,coalesce(new.raw_user_meta_data->>'full_name',''),'owner',new.raw_user_meta_data->>'phone');
  insert into public.notifications(company_id,msg) values(new_company_id,'Bienvenue sur FAXTRIX, '||company_name||' !');
  return new;
end;
$function$;
