const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

async function googleSearch(query: string, apiKey: string, cx: string) {
  const url = "https://www.googleapis.com/customsearch/v1?key=" + encodeURIComponent(apiKey) + "&cx=" + encodeURIComponent(cx) + "&q=" + encodeURIComponent(query) + "&num=5";
  const r = await fetch(url);
  if (!r.ok) throw new Error("Google Search HTTP " + r.status);
  const j = await r.json();
  return (j.items || []).map((x: any) => ({title:x.title, link:x.link, snippet:x.snippet}));
}

async function openRouter(messages: any[], apiKey: string, model: string) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method:"POST",
    headers:{
      "Authorization":"Bearer " + apiKey,
      "Content-Type":"application/json",
      "HTTP-Referer":"https://infotelcom.github.io/FAXTRIX-GitHub-Android/",
      "X-Title":"FAXTRIX Assistant"
    },
    body:JSON.stringify({model, messages, temperature:0.2})
  });
  const text = await r.text();
  if (!r.ok) throw new Error("OpenRouter HTTP " + r.status + ": " + text.slice(0,300));
  const j = JSON.parse(text);
  return j.choices?.[0]?.message?.content || "Je n'ai pas obtenu de réponse.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
  try {
    const body = await req.json();
    const query = String(body.query || "").trim();
    if (!query) return new Response(JSON.stringify({error:"Question vide"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});

    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    const model = Deno.env.get("OPENROUTER_MODEL") || "openrouter/free";
    const googleKey = Deno.env.get("GOOGLE_API_KEY");
    const googleCx = Deno.env.get("GOOGLE_CX");

    if (!openrouterKey) return new Response(JSON.stringify({error:"OPENROUTER_API_KEY n'est pas configurée dans Supabase."}),{status:503,headers:{...cors,"Content-Type":"application/json"}});

    let sources:any[] = [];
    const wantsWeb = /\b(dernière|dernier|aujourd'hui|actualité|actualités|news|récent|récente|version|prix|cours|recherche|cherche|internet|google|web)\b/i.test(query);
    if (wantsWeb && googleKey && googleCx) {
      try { sources = await googleSearch(query,googleKey,googleCx); } catch(e) { console.error("Google Search:",e); }
    }

    const sourceText = sources.length ? "\n\nSources web trouvées :\n" + sources.map((s,i)=>"["+(i+1)+"] "+s.title+" — "+s.snippet+" — "+s.link).join("\n") : "";
    const system = "Tu es l'assistant général de FAXTRIX/INFOTELCOM. Réponds en français, clairement et sans inventer. Tu peux expliquer l'informatique, les acronymes, le code, les technologies et répondre aux questions générales. Quand des sources web sont fournies, utilise-les pour les informations actuelles et cite [1], [2], etc. Ne prétends pas avoir consulté Internet si aucune source n'est fournie.\n" + sourceText;

    const answer = await openRouter([{role:"system",content:system},{role:"user",content:query}],openrouterKey,model);
    return new Response(JSON.stringify({answer,sources}),{headers:{...cors,"Content-Type":"application/json"}});
  } catch(e) {
    console.error(e);
    return new Response(JSON.stringify({error:e?.message || String(e)}),{status:500,headers:{...cors,"Content-Type":"application/json"}});
  }
});
