import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};

function json(data:any,status=200){return Response.json(data,{status,headers:{...cors,"Content-Type":"application/json"}});}

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
    if (req.method !== "POST") return json({error:"POST uniquement"},405);

    const googleKey=Deno.env.get("GOOGLE_API_KEY");
    const googleCx=Deno.env.get("GOOGLE_CX");
    const routerKey=Deno.env.get("OPENROUTER_API_KEY");
    const model=Deno.env.get("OPENROUTER_MODEL")||"openrouter/auto";
    const costTier=Deno.env.get("OPENROUTER_COST_TIER")||"medium";
    const supabaseUrl=Deno.env.get("SUPABASE_URL");
    const supabaseKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    try {
      const body=await req.json();
      const q=String(body?.q||"").trim().slice(0,700);
      if(!q) return json({error:"Requête vide"},400);

      let results:any[]=[];
      let searchWarning="";
      if(googleKey&&googleCx){
        const url=new URL("https://www.googleapis.com/customsearch/v1");
        url.searchParams.set("key",googleKey); url.searchParams.set("cx",googleCx);
        url.searchParams.set("q",q); url.searchParams.set("num","8"); url.searchParams.set("hl","fr");
        const googleRes=await fetch(url); const googleData=await googleRes.json();
        if(googleRes.ok) results=(googleData.items||[]).slice(0,8).map((x:any)=>({title:x.title,link:x.link,snippet:x.snippet}));
        else searchWarning=googleData?.error?.message||"Recherche Google indisponible.";
      } else searchWarning="Recherche Google non configurée.";

      let companyContext="";
      const auth=req.headers.get("Authorization");
      if(auth&&supabaseUrl&&supabaseKey){
        const userSb=createClient(supabaseUrl,supabaseKey,{global:{headers:{Authorization:auth}}});
        const me=await userSb.auth.getUser();
        const uid=me.data.user?.id;
        if(uid){
          const profile=await userSb.from("profiles").select("id,company_id,full_name,role,companies(name)").eq("id",uid).maybeSingle();
          const companyId=profile.data?.company_id;
          if(companyId){
            const [clients,tickets,missions,team]=await Promise.all([
              userSb.from("clients").select("nom,statut,valeur").eq("company_id",companyId).limit(100),
              userSb.from("tickets").select("numero,titre,statut,priorite,categorie,assigned_to,description,created_at").eq("company_id",companyId).order("created_at",{ascending:false}).limit(100),
              userSb.from("terrain_missions").select("technicien,client,adresse,statut,notes,compte_rendu,created_at").eq("company_id",companyId).order("created_at",{ascending:false}).limit(100),
              userSb.from("team_members").select("nom,role,statut,charge,email,specialites").eq("company_id",companyId).limit(100)
            ]);
            companyContext=JSON.stringify({
              entreprise:profile.data?.companies?.name||"Entreprise FAXTRIX",
              utilisateur:profile.data?.full_name||"",
              role:profile.data?.role||"",
              clients:clients.data||[],
              tickets:tickets.data||[],
              missions:missions.data||[],
              equipe:team.data||[]
            }).slice(0,30000);
          }
        }
      }

      if(!routerKey) return json({query:q,results,answer:null,warning:searchWarning||"OPENROUTER_API_KEY non configurée."});

      const webContext=results.length?results.map((x:any,i:number)=>"["+ (i+1)+"] "+(x.title||"Source")+"\n"+(x.snippet||"")+"\n"+(x.link||"")).join("\n\n"):"Aucune source Google disponible.";
      const prompt="Question utilisateur: "+q+
        "\n\nDONNÉES PRIVÉES FAXTRIX DE L'ENTREPRISE (à utiliser seulement pour répondre à cet utilisateur):\n"+(companyContext||"Aucune donnée privée disponible.")+
        "\n\nSOURCES WEB GOOGLE:\n"+webContext+
        "\n\nRéponds en français. Pour une question sur FAXTRIX, privilégie les données privées. Pour une question générale, utilise les sources web si elles existent. Cite les sources web [1], [2] quand tu les utilises. N'invente aucune donnée, personne, ticket ou source.";

      const aiRes=await fetch("https://openrouter.ai/api/v1/chat/completions",{
        method:"POST",
        headers:{"Authorization":"Bearer "+routerKey,"Content-Type":"application/json","HTTP-Referer":"https://infotelcom.github.io/FAXTRIX-GitHub-Android/","X-Title":"FAXTRIX Assistant"},
        body:JSON.stringify({
          model,
          messages:[
            {role:"system",content:"Tu es l'assistant IA polyvalent de FAXTRIX. Tu peux expliquer des concepts, analyser les données privées de l'entreprise autorisée par la session, et synthétiser des informations web. Respecte strictement la séparation entre entreprises. Ne révèle jamais de données privées d'une autre entreprise."},
            {role:"user",content:prompt}
          ],
          temperature:0.2,max_tokens:1800,
          tools:[
            {type:"openrouter:web_search",parameters:{engine:"auto"}},
            {type:"openrouter:web_fetch",parameters:{engine:"openrouter",max_content_tokens:12000}}
          ],
          max_tool_calls:3

        })
      });
      const aiData=await aiRes.json();
      if(!aiRes.ok) return json({query:q,results,answer:null,warning:aiData?.error?.message||"Synthèse OpenRouter indisponible."});
      return json({query:q,results,answer:aiData?.choices?.[0]?.message?.content||null,model,warning:searchWarning||null});
    } catch(e) {
      return json({error:e instanceof Error?e.message:"Erreur de recherche IA"},500);
    }
  }
};