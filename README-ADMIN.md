# FAXTRIX — INFOTELCOM ADMIN

Le portail `www/admin.html` est réservé à INFOTELCOM. Il n'est pas lié dans l'espace client.

## 1. Activer la sécurité Supabase

Dans **Supabase → SQL Editor**, exécuter :

`supabase/migrations/20260930_infotelcom_admin_security.sql`

La migration crée :
- demandes de droits ;
- droits utilisateur validés par INFOTELCOM ;
- rôles ;
- journal d'audit ;
- export centralisé ;
- portail d'administration ;
- politiques RLS restrictives pour les opérations d'écriture sur CRM, tickets, terrain, équipes et automatisations.

## 2. Créer le premier administrateur INFOTELCOM

Créer d'abord son compte dans Supabase Auth, puis récupérer son UUID et exécuter :

```sql
update public.profiles
set role = 'infotelcom_admin'
where id = 'UUID_DU_COMPTE_INFOTELCOM';
```

Ne jamais mettre une clé `service_role` dans le navigateur.

## 3. Accès

Après connexion avec le compte administrateur :

`/admin.html`

Le portail permet :
- voir les entreprises ;
- voir les utilisateurs ;
- changer les rôles ;
- examiner les demandes de droits ;
- accorder/refuser un droit ;
- consulter le journal d'audit ;
- exporter les données d'une entreprise en CSV.

## 4. Support affiché aux entreprises

- contact.infotelcom@gmail.com
- +242 068498792
- +242 06 866 0821
- WhatsApp : +33 6 52 86 11 59

Les droits sensibles doivent rester attribués depuis l'administration INFOTELCOM.
