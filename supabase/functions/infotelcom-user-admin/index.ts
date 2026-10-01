import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

function json(data: unknown, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers:{...cors, "Content-Type":"application/json"}
  });
}

function secretKey(){
  try{
    const map=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
    if(map.default) return map.default;
  }catch(_e){}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}

const roles=["manager","commercial","technicien","lecture_seule"];

const demoUsers=[
  ["Amina Dupont","demo01@faxtrix.test","manager"],
  ["Marc Okoro","demo02@faxtrix.test","commercial"],
  ["Sophie Martin","demo03@faxtrix.test","technicien"],
  ["David Nkosi","demo04@faxtrix.test","technicien"],
  ["Nadia Kiala","demo05@faxtrix.test","commercial"],
  ["Kevin Mouzita","demo06@faxtrix.test","manager"],
  ["Sarah Mavoungou","demo07@faxtrix.test","lecture_seule"],
  ["Junior Ngoma","demo08@faxtrix.test","technicien"],
  ["Claire Bemba","demo09@faxtrix.test","commercial"],
  ["Patrick Samba","demo10@faxtrix.test","lecture_seule"]
];

export default {
  async fetch(req: Request){
    if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
    if(req.method!=="POST") return json({error:"POST uniquement"},405);

    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return json({error:"Authentification requise"},401);

    const url=Deno.env.get("SUPABASE_URL");
    const key=secretKey();
    const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
    if(!url||!key) return json({error:"Configuration serveur Supabase incomplète"},500);

    const callerSb=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const adminSb=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});

    const caller=await callerSb.auth.getUser(auth.slice(7));
    if(caller.error||!caller.data.user) return json({error:"Session invalide"},401);

    const {data:adminProfile,error:adminError}=await adminSb
      .from("profiles")
      .select("id,company_id,full_name,role")
      .eq("id",caller.data.user.id)
      .maybeSingle();

    if(adminError||!adminProfile||adminProfile.role!=="infotelcom_admin"){
      return json({error:"Accès réservé à l'administration INFOTELCOM"},403);
    }

    try{
      const body=await req.json();
      const action=String(body?.action||"invite");

      if(action==="invite"){
        const companyId=String(body?.company_id||"");
        const fullName=String(body?.full_name||"").trim().slice(0,120);
        const email=String(body?.email||"").trim().toLowerCase().slice(0,180);
        const role=roles.includes(body?.role)?body.role:"lecture_seule";
        if(!companyId||!fullName||!email) return json({error:"Entreprise, nom et e-mail sont obligatoires"},400);

        const company=await adminSb.from("companies").select("id,name").eq("id",companyId).maybeSingle();
        if(company.error||!company.data) return json({error:"Entreprise introuvable"},404);

        const invited=await adminSb.auth.admin.inviteUserByEmail(email,{
          data:{full_name:fullName,company_id:companyId,role},
          redirectTo:String(body?.redirect_to||"")
        });
        if(invited.error) return json({error:invited.error.message},400);

        const userId=invited.data.user?.id;
        if(!userId) return json({error:"Supabase n'a pas retourné l'utilisateur invité"},500);

        const profile=await adminSb.from("profiles").upsert({
          id:userId,company_id:companyId,full_name:fullName,role
        },{onConflict:"id"});
        if(profile.error) return json({error:"Utilisateur créé mais profil non rattaché : "+profile.error.message},500);

        await adminSb.from("admin_audit_logs").insert({
          admin_id:caller.data.user.id,company_id:companyId,
          action:"create_user_invitation",target_type:"user",target_id:userId,
          metadata:{email,full_name:fullName,role}
        });

        return json({ok:true,user_id:userId,message:"Invitation envoyée à "+email+"."});
      }

      if(action==="seed_demo"){
        const companyId=String(body?.company_id||"");
        if(!companyId) return json({error:"Entreprise obligatoire"},400);
        const company=await adminSb.from("companies").select("id,name").eq("id",companyId).maybeSingle();
        if(company.error||!company.data) return json({error:"Entreprise introuvable"},404);

        const created=[];
        for(let i=0;i<demoUsers.length;i++){
          const [fullName,email,role]=demoUsers[i];
          const password="Faxtrix#Demo"+String(i+1).padStart(2,"0")+"!2026";
          const u=await adminSb.auth.admin.createUser({
            email,password,email_confirm:true,
            user_metadata:{full_name:fullName,company_id:companyId,role,must_change_password:true}
          });
          if(u.error){
            created.push({full_name:fullName,email,password,error:u.error.message});
            continue;
          }
          const userId=u.data.user?.id;
          if(userId){
            await adminSb.from("profiles").upsert({
              id:userId,company_id:companyId,full_name:fullName,role
            },{onConflict:"id"});
            created.push({full_name:fullName,email,password,id:userId});
          }
        }

        await adminSb.from("admin_audit_logs").insert({
          admin_id:caller.data.user.id,company_id:companyId,
          action:"seed_demo_users",target_type:"company",target_id:companyId,
          metadata:{count:created.length}
        });

        return json({
          ok:true,
          message:"Création des 10 comptes de test terminée.",
          users:created
        });
      }

      return json({error:"Action inconnue"},400);
    }catch(e){
      return json({error:e instanceof Error?e.message:"Erreur serveur"},500);
    }
  }
};
