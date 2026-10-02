import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const roles=new Set(["manager","commercial","technicien","lecture_seule","owner","infotelcom_admin"]);
const demoUsers=[["Amina Dupont","demo01@faxtrix.test","manager"],["Marc Okoro","demo02@faxtrix.test","commercial"],["Sophie Martin","demo03@faxtrix.test","technicien"],["David Nkosi","demo04@faxtrix.test","technicien"],["Nadia Kiala","demo05@faxtrix.test","commercial"],["Kevin Mouzita","demo06@faxtrix.test","manager"],["Sarah Mavoungou","demo07@faxtrix.test","lecture_seule"],["Junior Ngoma","demo08@faxtrix.test","technicien"],["Claire Bemba","demo09@faxtrix.test","commercial"],["Patrick Samba","demo10@faxtrix.test","lecture_seule"]];

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});}
function secretKey(){return Deno.env.get("SUPABASE_SECRET_KEY")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}

async function getCaller(req:Request){
  const auth=req.headers.get("Authorization")||"",url=Deno.env.get("SUPABASE_URL"),key=secretKey(),anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!auth.startsWith("Bearer ")||!url||!key) throw new Error("Configuration serveur Supabase incomplète.");
  const callerSb=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const adminSb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const caller=await callerSb.auth.getUser(auth.slice(7));
  if(caller.error||!caller.data.user) throw new Error("Session invalide.");
  const p=await adminSb.from("profiles").select("id,company_id,role,full_name").eq("id",caller.data.user.id).maybeSingle();
  if(p.error||!p.data) throw new Error("Profil introuvable.");
  const allowed=p.data.role==="infotelcom_admin"||p.data.role==="owner"||p.data.role==="manager";
  let canManage=allowed;
  if(!canManage){
    const perm=await adminSb.from("user_permissions").select("permission,expires_at").eq("user_id",caller.data.user.id).eq("permission","user_manage").maybeSingle();
    canManage=!!perm.data&&(!perm.data.expires_at||new Date(perm.data.expires_at).getTime()>Date.now());
  }
  if(!canManage) throw new Error("Vous n'avez pas le droit de gérer les utilisateurs.");
  return {adminSb,caller:caller.data.user,profile:p.data,isInfotelcomAdmin:p.data.role==="infotelcom_admin"};
}

function makeTempPassword(fullName:string,email:string){
  const seed=(fullName.replace(/[^a-zA-Z]/g,"").slice(0,3)||"Fax").toLowerCase();
  const tail=Math.floor(1000+Math.random()*9000);
  return "Fax!"+seed.charAt(0).toUpperCase()+seed.slice(1)+"-"+tail;
}

async function findAuthUser(adminSb:any,email:string){
  const res=await adminSb.auth.admin.listUsers({page:1,perPage:1000});
  if(res.error) throw new Error("Impossible de rechercher le compte Auth : "+res.error.message);
  return (res.data?.users||[]).find((u:any)=>String(u.email||"").toLowerCase()===email.toLowerCase())||null;
}

async function createManagedUser(adminSb:any,p:any){
  const companyId=String(p.company_id||""),fullName=String(p.full_name||"").trim().slice(0,120),email=String(p.email||"").trim().toLowerCase().slice(0,180),role=String(p.role||"lecture_seule");
  if(!companyId||!fullName||!email) throw new Error("Entreprise, nom et e-mail sont obligatoires.");
  if(!roles.has(role)) throw new Error("Fonction utilisateur invalide.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Adresse e-mail invalide.");

  const company=await adminSb.from("companies").select("id,name").eq("id",companyId).maybeSingle();
  if(company.error||!company.data) throw new Error("Entreprise introuvable.");

  const password=String(p.password||"").trim()||makeTempPassword(fullName,email);
  if(password.length<6) throw new Error("Le mot de passe initial doit contenir au moins 6 caractères.");

  const metadata={full_name:fullName,company_id:companyId,role,must_change_password:true};
  let user:any=await findAuthUser(adminSb,email);
  let created=false;

  if(user){
    const existingProfile=await adminSb.from("profiles").select("company_id,role").eq("id",user.id).maybeSingle();
    if(existingProfile.data?.company_id && existingProfile.data.company_id!==companyId){
      throw new Error("Cet e-mail appartient déjà à un utilisateur d'une autre entreprise.");
    }
    const updated=await adminSb.auth.admin.updateUserById(user.id,{password,email_confirm:true,user_metadata:metadata});
    if(updated.error) throw new Error(updated.error.message||"Impossible de définir le mot de passe.");
    user=updated.data.user;
  }else{
    const createdRes=await adminSb.auth.admin.createUser({email,password,email_confirm:true,user_metadata:metadata});
    if(createdRes.error||!createdRes.data?.user) throw new Error(createdRes.error?.message||"Impossible de créer le compte utilisateur.");
    user=createdRes.data.user;
    created=true;
  }

  const profile=await adminSb.from("profiles").upsert({id:user.id,company_id:companyId,full_name:fullName,role},{onConflict:"id"});
  if(profile.error) throw new Error("Profil impossible à enregistrer : "+profile.error.message);

  await adminSb.from("invitations").upsert({company_id:companyId,email,full_name:fullName,role,accepted:true},{onConflict:"company_id,email"});
  return {full_name:fullName,email,role,company_id:companyId,user_id:user.id,temporary_password:password,created};
}

async function resetManagedPassword(adminSb:any,p:any,companyId:string){
  const email=String(p.email||"").trim().toLowerCase();
  if(!email) throw new Error("E-mail obligatoire.");
  const inv=await adminSb.from("invitations").select("company_id,email,full_name,role").eq("company_id",companyId).eq("email",email).maybeSingle();
  const prof=inv.data?null:await adminSb.from("profiles").select("id,company_id,full_name,role").eq("company_id",companyId).eq("full_name",String(p.full_name||"")).maybeSingle();
  const user=await findAuthUser(adminSb,email);
  if(!user) throw new Error("Compte Auth introuvable pour cet utilisateur.");
  const password=String(p.password||"").trim()||makeTempPassword(inv.data?.full_name||prof?.data?.full_name||email,email);
  const role=inv.data?.role||prof?.data?.role||"lecture_seule";
  const fullName=inv.data?.full_name||prof?.data?.full_name||email;
  const updated=await adminSb.auth.admin.updateUserById(user.id,{password,email_confirm:true,user_metadata:{full_name:fullName,company_id:companyId,role,must_change_password:true}});
  if(updated.error) throw new Error(updated.error.message||"Impossible de réinitialiser le mot de passe.");
  await adminSb.from("invitations").upsert({company_id:companyId,email,full_name:fullName,role,accepted:true},{onConflict:"company_id,email"});
  return {email,full_name:fullName,role,temporary_password:password,user_id:user.id};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"POST uniquement"},405);
  try{
    const {adminSb,caller,profile,isInfotelcomAdmin}=await getCaller(req),body=await req.json(),action=String(body.action||"");
    if(action==="invite"||action==="create_user"){
      let companyId=String(body.company_id||"");
      if(!isInfotelcomAdmin) companyId=profile.company_id;
      if(!companyId) throw new Error("Entreprise obligatoire.");
      const role=String(body.role||"lecture_seule");
      if(!isInfotelcomAdmin&&role==="owner") throw new Error("Seule INFOTELCOM peut préparer un accès propriétaire.");
      const result=await createManagedUser(adminSb,{...body,company_id:companyId});
      await adminSb.from("admin_audit_logs").insert({admin_id:caller.id,company_id:result.company_id,action:"user_password_provisioned",target_type:"profile",target_id:result.user_id,metadata:{email:result.email,role:result.role,created:result.created}});
      return json({ok:true,message:result.created?"Compte créé et activé avec un mot de passe initial.":"Compte existant : mot de passe initial réinitialisé.",...result});
    }
    if(action==="set_password"){
      const companyId=isInfotelcomAdmin?String(body.company_id||""):profile.company_id;
      if(!companyId) throw new Error("Entreprise obligatoire.");
      const result=await resetManagedPassword(adminSb,body,companyId);
      await adminSb.from("admin_audit_logs").insert({admin_id:caller.id,company_id:companyId,action:"user_password_reset",target_type:"profile",target_id:result.user_id,metadata:{email:result.email,role:result.role}});
      return json({ok:true,message:"Mot de passe initial défini. Transmettez-le à l'utilisateur de façon sécurisée.",...result});
    }
    if(action==="regenerate_link"){
      return json({error:"Les liens d'invitation ne sont plus nécessaires. Utilisez le mot de passe initial."},410);
    }
    if(action==="seed_infotelcom_admins"){
      if(!isInfotelcomAdmin) throw new Error("Action réservée à INFOTELCOM.");
      const companyId=String(body.company_id||"");
      if(!companyId) throw new Error("Entreprise INFOTELCOM obligatoire.");
      const admins=[
        ["ALBERT MAYELE","contact.infotelcom@gmail.com"],
        ["CHRIST MAWANA","contact.infotelcom+christ@gmail.com"],
        ["JUVEL NGALIKO","contact.infotelcom+juvel@gmail.com"]
      ];
      const users:any[]=[];
      for(const [full_name,email] of admins){
        try{
          users.push(await createManagedUser(adminSb,{company_id:companyId,full_name,email,role:"infotelcom_admin"}));
        }catch(e){
          users.push({full_name,email,role:"infotelcom_admin",error:e instanceof Error?e.message:String(e)});
        }
      }
      await adminSb.from("admin_audit_logs").insert({
        admin_id:caller.id,company_id:companyId,action:"seed_infotelcom_admins",
        target_type:"company",target_id:companyId,
        metadata:{count:users.filter(x=>!x.error).length}
      });
      return json({ok:true,message:"Les trois administrateurs INFOTELCOM sont préparés.",users});
    }
    if(action==="seed_demo"){
      if(!isInfotelcomAdmin) throw new Error("Action réservée à INFOTELCOM.");
      const companyId=String(body.company_id||"");
      if(!companyId) throw new Error("Entreprise obligatoire.");
      const users:any[]=[];
      for(const [full_name,email,role] of demoUsers){
        try{users.push(await createManagedUser(adminSb,{company_id:companyId,full_name,email,role}));}
        catch(e){users.push({full_name,email,role,error:e instanceof Error?e.message:String(e)});}
      }
      await adminSb.from("admin_audit_logs").insert({admin_id:caller.id,company_id:companyId,action:"seed_demo_users",target_type:"company",target_id:companyId,metadata:{count:users.filter(x=>!x.error).length}});
      return json({ok:true,message:"Les 10 comptes de démonstration sont actifs. Chaque compte possède maintenant un mot de passe initial.",users});
    }
    return json({error:"Action inconnue."},400);
  }catch(e){return json({error:e instanceof Error?e.message:String(e)},403);}
});