# Configuration Assistant IA FAXTRIX

## Secrets Supabase Edge Functions

Dans Supabase > Project Settings > Edge Functions > Secrets, ajouter :

- GOOGLE_API_KEY = clé Google Custom Search
- GOOGLE_CX = identifiant du moteur Programmable Search
- OPENROUTER_API_KEY = clé OpenRouter
- OPENROUTER_MODEL = openrouter/auto

Les clés ne doivent pas être placées dans le JavaScript public ni dans GitHub. Google recommande de restreindre les clés et de ne pas les committer dans le dépôt. OpenRouter fournit un endpoint compatible OpenAI et un routeur automatique de modèles.

## Fonctionnement

FAXTRIX Assistant :
1. répond directement aux questions sur les données internes ;
2. explique les acronymes et mots-clés du programme ;
3. pour une question générale, appelle la fonction Supabase `ai-research` ;
4. Google Custom Search fournit les sources ;
5. OpenRouter synthétise les résultats ;
6. FAXTRIX affiche la réponse et les sources consultées.

## Messagerie

Exécuter dans Supabase SQL Editor :

`supabase/migrations/20260930_chat_final_fix.sql`

Cette migration ajoute aussi `my_company_chat_profiles()`, qui permet de rechercher uniquement les profils de la même entreprise.

## Déploiement

Les fonctions `google-search`, `ai-research` et `turn-ice-servers` doivent être déployées sur Supabase. Le workflow GitHub de fonctions reste volontairement manuel tant que les secrets de déploiement Supabase ne sont pas configurés.
