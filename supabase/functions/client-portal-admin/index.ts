import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const key=()=>Deno.env.get("SUPABASE_SECRET_KEY")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
async function caller(req:Request){
 const auth=req.headers.get("Authorization")||"",url=Deno.env.get("SUPABASE_URL"),secret=key(),anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(!auth.startsWith("Bearer ")||!url||!secret)throw new Error("Configuration serveur Supabase incomplète.");
 const userSb=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const admin=createClient(url,secret,{auth:{persistSession:false}});
 const u=await userSb.auth.getUser(auth.slice(7)); if(u.error||!u.data.user)throw new Error("Session invalide.");
 const p=await admin.from("profiles").select("id,company_id,role").eq("id",u.data.user.id).maybeSingle(); if(p.error||!p.data)throw new Error("Profil introuvable.");
 let allowed=["infotelcom_admin","owner","manager"].includes(p.data.role);
 if(!allowed){const x=await admin.from("user_permissions").select("permission,expires_at").eq("user_id",u.data.user.id).eq("permission","user_manage").maybeSingle();allowed=!!x.data&&(!x.data.expires_at||new Date(x.data.expires_at).getTime()>Date.now());}
 if(!allowed)throw new Error("Vous n'avez pas le droit de gérer les accès du portail client.");
 return {admin,user:u.data.user,profile:p.data};
}
function temp(name:string){const s=(name.replace(/[^a-zA-Z]/g,"").slice(0,3)||"Cli");return "Fax!"+s.charAt(0).toUpperCase()+s.slice(1).toLowerCase()+"-"+Math.floor(1000+Math.random()*9000);}
async function find(admin:any,email:string){const r=await admin.auth.admin.listUsers({page:1,perPage:1000});if(r.error)throw new Error(r.error.message);return (r.data?.users||[]).find((u:any)=>String(u.email||"").toLowerCase()===email.toLowerCase())||null;}
Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"POST uniquement"},405);try{
 const {admin,user,profile}=await caller(req),b=await req.json(),companyId=profile.role==="infotelcom_admin"?String(b.company_id||""):profile.company_id,clientId=String(b.client_id||"");
 if(!companyId||!clientId)throw new Error("Entreprise et client obligatoires.");
 const c=await admin.from("clients").select("id,company_id,nom,email").eq("id",clientId).eq("company_id",companyId).maybeSingle();if(c.error||!c.data)throw new Error("Client introuvable.");
 if(String(b.action||"")==="deactivate"){await admin.from("client_portal_accounts").update({active:false}).eq("client_id",clientId).eq("company_id",companyId);return json({ok:true});}
 const email=String(b.email||c.data.email||"").trim().toLowerCase(),name=String(b.full_name||c.data.nom||"").trim();if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("E-mail client invalide.");
 const password=String(b.password||"").trim()||temp(name);if(password.length<6)throw new Error("Mot de passe trop court.");
 let au=await find(admin,email);
 if(au){const prof=await admin.from("profiles").select("company_id").eq("id",au.id).maybeSingle();const pa=await admin.from("client_portal_accounts").select("company_id,client_id").eq("id",au.id).maybeSingle();if(prof.data?.company_id&&prof.data.company_id!==companyId)throw new Error("Cet e-mail appartient à une autre entreprise.");if(pa.data&&(pa.data.company_id!==companyId||pa.data.client_id!==clientId))throw new Error("Cet e-mail est déjà lié à un autre client.");const u=await admin.auth.admin.updateUserById(au.id,{password,email_confirm:true,user_metadata:{full_name:name,company_id:companyId,client_id:clientId,client_portal:true,must_change_password:true}});if(u.error)throw new Error(u.error.message);au=u.data.user;}
 else{const u=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name,company_id:companyId,client_id:clientId,client_portal:true,must_change_password:true}});if(u.error||!u.data?.user)throw new Error(u.error?.message||"Création impossible.");au=u.data.user;}
 const up=await admin.from("client_portal_accounts").upsert({id:au.id,company_id:companyId,client_id:clientId,email,full_name:name,active:true},{onConflict:"client_id"});if(up.error)throw new Error(up.error.message);
 const cu=await admin.from("clients").update({email}).eq("id",clientId).eq("company_id",companyId);if(cu.error)throw new Error(cu.error.message);
 await admin.from("admin_audit_logs").insert({admin_id:user.id,company_id:companyId,action:"client_portal_provisioned",target_type:"client",target_id:clientId,metadata:{email}});
 return json({ok:true,email,full_name:name,temporary_password:password,user_id:au.id,client_id:clientId,portal_path:"/client.html"});
}catch(e){return json({error:e instanceof Error?e.message:String(e)},403);}});