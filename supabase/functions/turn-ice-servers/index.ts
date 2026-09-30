import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const keyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID");
    const apiToken = Deno.env.get("CLOUDFLARE_TURN_API_TOKEN");

    if (!accountId || !keyId || !apiToken) {
      return new Response(JSON.stringify({
        error: "TURN_NOT_CONFIGURED",
        iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }]
      }), { status: 503, headers: cors });
    }

    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ttl: 3600 })
      }
    );

    const data = await response.json();
    if (!response.ok || !data.iceServers) {
      return new Response(JSON.stringify({
        error: "TURN_PROVIDER_ERROR",
        details: data
      }), { status: 502, headers: cors });
    }

    return new Response(JSON.stringify({ iceServers: data.iceServers }), {
      status: 200,
      headers: cors
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: "TURN_INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error)
    }), { status: 500, headers: cors });
  }
});
