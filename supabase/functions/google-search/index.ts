const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return Response.json({ error: "POST uniquement" }, { status: 405, headers: cors });

    const apiKey = Deno.env.get("GOOGLE_API_KEY");
    const cx = Deno.env.get("GOOGLE_CX");
    if (!apiKey || !cx) {
      return Response.json({ error: "Recherche Google non configurée. Ajoutez GOOGLE_API_KEY et GOOGLE_CX dans les secrets Supabase." }, { status: 503, headers: cors });
    }

    try {
      const body = await req.json();
      const q = String(body?.q || "").trim().slice(0, 300);
      if (!q) return Response.json({ error: "Requête vide" }, { status: 400, headers: cors });

      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("cx", cx);
      url.searchParams.set("q", q);
      url.searchParams.set("num", "5");
      url.searchParams.set("hl", "fr");
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) return Response.json({ error: data?.error?.message || "Recherche Google impossible" }, { status: res.status, headers: cors });

      const results = (data.items || []).slice(0, 5).map((x: any) => ({
        title: x.title,
        link: x.link,
        snippet: x.snippet
      }));
      return Response.json({ query: q, results }, { headers: { ...cors, "Content-Type": "application/json" } });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Erreur de recherche" }, { status: 500, headers: cors });
    }
  }
};