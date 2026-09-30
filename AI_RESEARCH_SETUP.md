# FAXTRIX — configuration IA et recherche web

## Architecture

FAXTRIX utilise une Edge Function Supabase (`ai-research`) afin que les clés tierces ne soient jamais placées dans le JavaScript du navigateur.

- Google Custom Search : récupération de résultats web.
- OpenRouter : synthèse IA et réponses générales.
- `OPENROUTER_MODEL` : modèle OpenRouter utilisé, par défaut `openrouter/auto`.
- Les données sensibles restent dans les secrets Supabase.

## Secrets Supabase à créer

Dans Supabase : **Project → Edge Functions → Secrets**.

Créer :
- `GOOGLE_API_KEY` = votre clé Google Custom Search
- `GOOGLE_CX` = votre identifiant de moteur Programmable Search
- `OPENROUTER_API_KEY` = votre clé OpenRouter
- `OPENROUTER_MODEL` = `openrouter/auto` (facultatif)

Supabase recommande de conserver les clés dans les secrets Edge Functions et de ne jamais les mettre dans le code client ou dans Git.

## Avec la CLI Supabase

Créer un fichier local non commité, par exemple `supabase/functions/.env` :

```env
GOOGLE_API_KEY=VOTRE_CLE_GOOGLE
GOOGLE_CX=VOTRE_CX
OPENROUTER_API_KEY=VOTRE_CLE_OPENROUTER
OPENROUTER_MODEL=openrouter/auto
```

Puis :
```bash
supabase secrets set --env-file supabase/functions/.env
```

Vérification :
```bash
supabase secrets list
```

Ne jamais commiter ce fichier.

## Google Custom Search

Google indique que l'API Custom Search JSON n'est plus ouverte aux nouveaux clients et prévoit sa fin au 1er janvier 2027. Pour un compte existant, elle reste utilisable pendant la période de transition. Prévoir une solution de remplacement à terme.

## Déploiement

Après modification de `supabase/functions/ai-research/index.ts` :
```bash
supabase functions deploy ai-research
```

Les secrets n'ont pas besoin d'être inscrits dans GitHub.

## Messagerie

La migration `supabase/migrations/20260930_chat_final_fix.sql` contient le correctif RLS et la fonction `start_chat_conversation(uuid)`.

Une erreur SQL précédente provenait de `AS $` au lieu de `AS $$`. Le fichier du dépôt a été corrigé. Il faut exécuter à nouveau cette migration corrigée dans le SQL Editor Supabase.