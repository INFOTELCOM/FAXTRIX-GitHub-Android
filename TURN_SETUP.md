# FAXTRIX — TURN production

FAXTRIX utilise le service TURN géré de Cloudflare Realtime pour les appels WebRTC.

## Secrets GitHub requis

Configurer dans **Settings → Secrets and variables → Actions** :

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` = `xtkcfhbsksoqbpnaciga`

Puis dans les secrets de la fonction Supabase :

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_TURN_KEY_ID`
- `CLOUDFLARE_TURN_API_TOKEN`

Le token Cloudflare doit disposer du droit nécessaire à la génération des credentials TURN.

Les clés longues ne sont jamais envoyées au navigateur. La fonction Edge génère des credentials temporaires (TTL 1 h) et renvoie uniquement les ICE servers à l'application.

Sans secrets Cloudflare, l'application retombe volontairement sur STUN uniquement et n'expose aucun secret.

Référence Cloudflare : https://developers.cloudflare.com/realtime/turn/generate-credentials/
