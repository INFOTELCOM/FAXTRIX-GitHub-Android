const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
    if (req.method !== "POST") return Response.json({error:"POST uniquement"},{status:405,headers:cors});

    const googleKey=Deno.env.get("GOOGLE_API_KEY");
    const googleCx=Deno.env.get("GOOGLE_CX");
    const routerKey=Deno.env.get("OPENROUTER_API_KEY");
    const model=Deno.env.get("OPENROUTER_MODEL")||"openrouter/auto";

    try {
      const body=await req.json();
      const q=String(body?.q||"").trim().slice(0,500);
      if(!q) return Response.json({error:"Requête vide"},{status:400,headers:cors});

      let results:any[]=[];
      let searchWarning="";

      if(googleKey&&googleCx){
        const url=new URL("https://www.googleapis.com/customsearch/v1");
        url.searchParams.set("key",googleKey);
        url.searchParams.set("cx",googleCx);
        url.searchParams.set("q",q);
        url.searchParams.set("num","8");
        url.searchParams.set("hl","fr");
        const googleRes=await fetch(url);
        const googleData=await googleRes.json();
        if(googleRes.ok){
          results=(googleData.items||[]).slice(0,8).map((x:any)=>({title:x.title,link:x.link,snippet:x.snippet}));
        }else{
          searchWarning=googleData?.error?.message||"Recherche Google indisponible.";
        }
      }else{
        searchWarning="Recherche Google non configurée. L'IA peut néanmoins répondre via OpenRouter.";
      }

      if(!routerKey){
        return Response.json({
          query:q,
          results,
          answer:null,
          warning:searchWarning||"OPENROUTER_API_KEY non configurée."
        },{headers:{...cors,"Content-Type":"application/json"}});
      }

      const context=results.length
        ? results.map((x:any,i:number)=>"["+(i+1)+"] "+(x.title||"Source")+"\n"+(x.snippet||"")+"\n"+(x.link||"")).join("\n\n")
        : "Aucune source web Google disponible.";

      const prompt=results.length
        ? "Réponds en français à la question suivante en t’appuyant prioritairement sur les sources web fournies.\n\nQuestion: "+q+"\n\nSources:\n"+context+"\n\nRègles: réponse claire et utile, incertitudes signalées, aucun fait inventé, citations [1], [2], etc."
        : "Réponds en français à la question suivante avec tes connaissances générales. Sois clair, précis et honnête sur les incertitudes. Il n'y a actuellement aucune source web Google disponible, donc ne prétends pas avoir effectué une recherche web.\n\nQuestion: "+q;

      const aiRes=await fetch("https://openrouter.ai/api/v1/chat/completions",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+routerKey,
          "Content-Type":"application/json",
          "HTTP-Referer":"https://infotelcom.github.io/FAXTRIX-GitHub-Android/",
          "X-Title":"FAXTRIX Assistant"
        },
        body:JSON.stringify({
          model,
          messages:[
            {role:"system",content:"Tu es l’assistant IA polyvalent de FAXTRIX. Tu peux expliquer des concepts techniques, répondre aux questions générales et synthétiser des sources web. Si des sources sont fournies, appuie-toi dessus. N'invente jamais une source ni une information."},
            {role:"user",content:prompt}
          ],
          temperature:0.2,
          max_tokens:1600
        })
      });
      const aiData=await aiRes.json();
      if(!aiRes.ok) return Response.json({query:q,results,answer:null,warning:aiData?.error?.message||"Synthèse OpenRouter indisponible."},{headers:{...cors,"Content-Type":"application/json"}});

      return Response.json({
        query:q,
        results,
        answer:aiData?.choices?.[0]?.message?.content||null,
        model,
        warning:searchWarning||null
      },{headers:{...cors,"Content-Type":"application/json"}});
    } catch(e) {
      return Response.json({error:e instanceof Error?e.message:"Erreur de recherche IA"},{status:500,headers:cors});
    }
  }
};