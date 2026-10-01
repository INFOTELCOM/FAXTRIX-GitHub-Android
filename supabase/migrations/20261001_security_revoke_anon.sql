-- FAXTRIX — ne pas exposer les fonctions SECURITY DEFINER à anon
revoke execute on function public.my_company_chat_profiles() from anon;
revoke execute on function public.is_chat_member(uuid,uuid) from anon;
revoke execute on function public.start_chat_conversation(uuid) from anon;
revoke execute on function public.is_infotelcom_admin() from anon;
revoke execute on function public.infotelcom_admin_bootstrap() from anon;
revoke execute on function public.infotelcom_set_user_role(uuid,text) from anon;
revoke execute on function public.infotelcom_review_permission(uuid,text,text) from anon;
revoke execute on function public.infotelcom_export_company(uuid) from anon;
revoke execute on function public.request_faxtrix_permission(text,text) from anon;
revoke execute on function public.my_permission_requests() from anon;
revoke execute on function public.my_permissions() from anon;
