# FAXTRIX — Web + Android
Site github : https://infotelcom.github.io/FAXTRIX-GitHub-Android/site.html

FAXTRIX est une application de gestion d'entreprise (CRM, tickets, terrain, équipes, automatisations, rapports, sécurité et assistant) avec un espace web et une application Android construite avec Capacitor.

## Ce qui a été préparé

- **Web** : l'espace existant reste disponible dans `www/index.html` et `www/site.html`.
- **Android** : la même interface métier est empaquetée dans une application native Capacitor.
- **Mobile** : disposition adaptée au téléphone avec barre basse `Accueil / Services / Tickets / Équipe / Profil`, cartes de services et tiroirs mobiles inspirés de la maquette FAXTRIX.
- **Données** : web et Android utilisent le même backend Supabase et les mêmes tables. Une donnée créée dans l'application apparaît donc dans l'espace web du même compte/entreprise, et inversement, dès que l'appareil est connecté.
- **Sécurité** : les requêtes restent filtrées par l'entreprise via le modèle d'accès existant côté Supabase.

## Générer l'APK automatiquement avec GitHub

Le dépôt contient `.github/workflows/build-android.yml`.

À chaque push sur `main` qui touche le site ou la configuration, GitHub Actions :

1. installe Node.js et Java 17 ;
2. installe les dépendances npm ;
3. crée le projet Android Capacitor ;
4. synchronise `www/` dans Android ;
5. compile `app-debug.apk` ;
6. publie l'APK comme **GitHub Actions Artifact**.

Le même workflow peut être lancé manuellement avec **Actions → FAXTRIX Android APK → Run workflow**.

## Développement local

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android
```

Pour produire un APK debug :

```bash
cd android
./gradlew assembleDebug
```

APK :

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Déploiement web

Le workflow `.github/workflows/deploy-pages.yml` publie uniquement le contenu de `www/` sur GitHub Pages. Cela permet de conserver l'accès web séparé de l'application Android.

## Synchronisation web ↔ Android

Il n'y a pas de seconde base de données locale pour les données métier : les deux interfaces se connectent au même Supabase. Le flux est donc :

```text
                 ┌──────────────────────┐
                 │       SUPABASE       │
                 │ Auth + données métier│
                 └──────────┬───────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
       ┌──────▼──────┐             ┌──────▼──────┐
       │ Espace WEB  │             │ App Android │
       │ index.html  │             │ Capacitor   │
       └─────────────┘             └─────────────┘
```

Ainsi, le compte, l'entreprise, les clients, tickets, missions, membres, automatisations et notifications restent communs.

## Configuration

- App ID : `com.infotelcom.faxtrix`
- Nom : `FAXTRIX`
- Répertoire web embarqué : `www/`
