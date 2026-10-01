import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const roles=new Set(["manager","commercial","technicien","lecture_seule","owner"]);
const demoUsers=[["Amina Dupont","demo01@faxtrix.test","manager"],["Marc Okoro","demo02@faxtrix.test","commercial"],["Sophie Martin","demo03@faxtrix.test","technicien"],["David Nkosi","demo04@faxtrix.test","technicien"],["Nadia Kiala","demo05@faxtrix.test","commercial"],["Kevin Mouzita","demo06@faxtrix.test","manager"],["Sarah Mavoungou","demo07@faxtrix.test","lecture_seule"],["Junior Ngoma","demo08@faxtrix.test","technicien"],["Claire Bemba","demo09@faxtrix.test","commercial"],["Patrick Samba","demo10@faxtrix.test","lecture_seule"]];
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});}
function secretKey(){return Deno.env.get("SUPABASE_SECRET_KEY")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
async function getAdmin(req:Request){
  const auth=req.headers.get("Authorization")||"",url=Deno.env.get("SUPABASE_URL"),key=secretKey(),anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  if(!auth.startsWith("Bearer ")||!url||!key) throw new Error("Configuration serveur Supabase incomplète.");
  const callerSb=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const adminSb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const caller=await callerSb.auth.getUser(auth.slice(7));
  if(caller.error||!caller.data.user) throw new Error("Session invalide.");
  const p=await adminSb.from("profiles").select("id,role").eq("id",caller.data.user.id).maybeSingle();
  if(p.error||p.data?.role!=="infotelcom_admin") throw new Error("Accès réservé à l'administration INFOTELCOM.");
  return {adminSb,caller:caller.data.user};
}
async function createInvite(adminSb:any,p:any){
  const companyId=String(p.company_id||""),fullName=String(p.full_name||"").trim().slice(0,120),email=String(p.email||"").trim().toLowerCase().slice(0,180),role=String(p.role||"lecture_seule"),redirectTo=String(p.redirect_to||"https://infotelcom.github.io/FAXTRIX-GitHub-Android/");
  if(!companyId||!fullName||!email) throw new Error("Entreprise, nom et e-mail sont obligatoires.");
  if(!roles.has(role)) throw new Error("Fonction utilisateur invalide.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
  const company=await adminSb.from("companies").select("id,name").eq("id",companyId).maybeSingle();
  if(company.error||!company.data) throw new Error("Entreprise introuvable.");
  const metadata={full_name:fullName,company_id:companyId,role,must_change_password:true};
  let user:any=null,actionLink:string|null=null,emailSent=false;
  if(p.generate_link){
    const generated=await adminSb.auth.admin.generateLink({type:"invite",email,options:{data:metadata,redirectTo}});
    if(generated.error||!generated.data?.user) throw new Error(generated.error?.message||"Impossible de générer le lien d'invitation.");
    user=generated.data.user; actionLink=generated.data.properties?.action_link||null;
  }else{
    const invited=await adminSb.auth.admin.inviteUserByEmail(email,{data:metadata,redirectTo});
    if(invited.error||!invited.data?.user) throw new Error(invited.error?.message||"Impossible d'envoyer l'invitation.");
    user=invited.data.user; emailSent=true;
  }
  const profile=await adminSb.from("profiles").upsert({id:user.id,company_id:companyId,full_name:fullName,role},{onConflict:"id"});
  if(profile.error){await adminSb.auth.admin.deleteUser(user.id);throw new Error("Profil impossible à enregistrer : "+profile.error.message);}
  await adminSb.from("invitations").upsert({company_id:companyId,email,full_name:fullName,role,accepted:false},{onConflict:"company_id,email"});
  return {full_name:fullName,email,role,company_id:companyId,user_id:user.id,action_link:actionLink,email_sent:emailSent};
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"POST uniquement"},405);
  try{
    const {adminSb,caller}=await getAdmin(req),body=await req.json(),action=String(body.action||"");
    if(action==="invite"){
      const result=await createInvite(adminSb,body);
      await adminSb.from("admin_audit_logs").insert({admin_id:caller.id,company_id:result.company_id,action:"user_invited",target_type:"profile",target_id:result.user_id,metadata:{email:result.email,role:result.role}});
      return json({ok:true,message:result.email_sent?"Invitation envoyée. L'utilisateur choisira son mot de passe depuis le lien reçu.":"Compte créé et lien d'invitation préparé.",...result});
    }
    if(action==="seed_demo"){
      const companyId=String(body.company_id||""),redirectTo=String(body.redirect_to||"https://infotelcom.github.io/FAXTRIX-GitHub-Android/");
      if(!companyId) throw new Error("Entreprise obligatoire.");
      const users:any[]=[];
      for(const [full_name,email,role] of demoUsers){try{users.push(await createInvite(adminSb,{company_id:companyId,full_name,email,role,redirect_to:redirectTo,generate_link:true}));}catch(e){users.push({full_name,email,role,error:e instanceof Error?e.message:String(e)});}}
      await adminSb.from("admin_audit_logs").insert({admin_id:caller.id,company_id:companyId,action:"seed_demo_users",target_type:"company",target_id:companyId,metadata:{count:users.filter(x=>!x.error).length}});
      return json({ok:true,message:"Les 10 comptes de démonstration ont été préparés. Chaque utilisateur choisit son mot de passe via son invitation.",users});
    }
    return json({error:"Action inconnue."},400);
  }catch(e){return json({error:e instanceof Error?e.message:String(e)},403);}
});