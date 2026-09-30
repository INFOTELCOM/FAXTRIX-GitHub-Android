const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
    if (req.method !== "POST") return Response.json({error:"POST uniquement"},{status:405,headers:cors});
    const googleKey=Deno.env.get("GOOGLE_API_KEY"), googleCx=Deno.env.get("GOOGLE_CX"), routerKey=Deno.env.get("OPENROUTER_API_KEY"), model=Deno.env.get("OPENROUTER_MODEL")||"openrouter/auto";
    if(!googleKey||!googleCx) return Response.json({error:"Recherche web non configurée. Ajoutez GOOGLE_API_KEY et GOOGLE_CX dans les secrets Supabase."},{status:503,headers:cors});
    try {
      const body=await req.json(), q=String(body?.q||"").trim().slice(0,500);
      if(!q) return Response.json({error:"Requête vide"},{status:400,headers:cors});
      const url=new URL("https://www.googleapis.com/customsearch/v1"); url.searchParams.set("key",googleKey); url.searchParams.set("cx",googleCx); url.searchParams.set("q",q); url.searchParams.set("num","8"); url.searchParams.set("hl","fr");
      const googleRes=await fetch(url), googleData=await googleRes.json();
      if(!googleRes.ok) return Response.json({error:googleData?.error?.message||"Recherche Google impossible"},{status:googleRes.status,headers:cors});
      const results=(googleData.items||[]).slice(0,8).map((x:any)=>({title:x.title,link:x.link,snippet:x.snippet}));
      if(!routerKey) return Response.json({query:q,results,answer:null,warning:"OPENROUTER_API_KEY non configurée."},{headers:{...cors,"Content-Type":"application/json"}});
      const context=results.map((x:any,i:number)=>"["+(i+1)+"] "+(x.title||"Source")+"\n"+(x.snippet||"")+"\n"+(x.link||"")).join("\n\n");
      const prompt="Réponds en français à la question suivante en t’appuyant prioritairement sur les sources web fournies.\n\nQuestion: "+q+"\n\nSources:\n"+context+"\n\nRègles: réponse claire et utile, incertitudes signalées, aucun fait inventé, citations [1], [2], etc.";
      const aiRes=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+routerKey,"Content-Type":"application/json","HTTP-Referer":"https://infotelcom.github.io/FAXTRIX-GitHub-Android/","X-Title":"FAXTRIX Assistant"},body:JSON.stringify({model,messages:[{role:"system",content:"Tu es l’assistant de recherche de FAXTRIX. Tu synthétises uniquement les informations web fournies et ne dois pas inventer les informations manquantes."},{role:"user",content:prompt}],temperature:0.2,max_tokens:1200})});
      const aiData=await aiRes.json();
      if(!aiRes.ok) return Response.json({query:q,results,answer:null,warning:aiData?.error?.message||"Synthèse OpenRouter indisponible."},{headers:{...cors,"Content-Type":"application/json"}});
      return Response.json({query:q,results,answer:aiData?.choices?.[0]?.message?.content||null,model},{headers:{...cors,"Content-Type":"application/json"}});
    } catch(e) { return Response.json({error:e instanceof Error?e.message:"Erreur de recherche IA"},{status:500,headers:cors}); }
  }
};