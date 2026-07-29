# Déploiement — Cloudflare Pages (pas à pas)

Le B2B se déploie comme un **SPA statique** (browser-only, pas de SSR) sur
**Cloudflare Pages**. Ce doc décrit exactement quoi cliquer et paramétrer sur le
site Cloudflare. Pour le _pourquoi_ (statique vs SSR, appels API), voir le
[README](./README.md).

> ⚠️ **Le piège à retenir** : le build **par défaut** (`ng build`) est **SSR**
> (`outputMode: server`). Cloudflare Pages ne sert que du statique → il faut
> impérativement la configuration `cloudflare` via le script `build:cloudflare`.
> Si tu laisses la build command sur `npm run build`, le déploiement produit un
> bundle serveur inutilisable.

---

## 0. Prérequis (déjà en place)

- Le repo est sur GitHub : `hugoheynard/lfd`.
- La configuration Angular `cloudflare` existe (`angular.json` → `outputMode:
static`, `ssr: false`, `server: false`).
- Le script existe : `build:cloudflare` (`ng build --configuration cloudflare`).
- Le fallback SPA existe : `public/_redirects` (`/* /index.html 200`) — copié tel
  quel dans la sortie, donc les deep-links marchent.

Rien à coder : tout se passe côté dashboard Cloudflare.

---

## 1. Créer le projet Pages

1. Se connecter sur **dash.cloudflare.com**.
2. Menu de gauche : **Workers & Pages** → bouton **Create** → onglet **Pages** →
   **Connect to Git**.
3. Autoriser Cloudflare à accéder à GitHub (si pas déjà fait), puis choisir le
   repo **`hugoheynard/lfd`**.
4. **Set up builds and deployments** → passer aux réglages ci-dessous.

---

## 2. Build settings (l'écran clé)

Renseigner **exactement** ces valeurs :

| Champ Cloudflare                | Valeur                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| **Framework preset**            | `None`                                                                  |
| **Build command**               | `pnpm --filter lfc-b2b-platform-frontend build:cloudflare`              |
| **Build output directory**      | `apps/lfc-B2B-platform-frontend/dist/lfc-b2b-platform-frontend/browser` |
| **Root directory** _(advanced)_ | `/` (racine du repo — **ne pas** mettre le sous-dossier de l'app)       |

**Pourquoi la racine et pas `apps/lfc-B2B-platform-frontend` ?** C'est un monorepo
pnpm : `fold-ng` est résolu via `catalog:` dans `pnpm-workspace.yaml`. L'install
doit tourner à la **racine** pour que le workspace se résolve ; le `--filter` ne
build que l'app B2B. Si tu mets le root sur le sous-dossier, l'install échoue sur
la dépendance catalog.

Cloudflare détecte **pnpm** automatiquement (champ `packageManager: pnpm@10.12.1`).

---

## 3. Variables d'environnement (build-time)

Section **Environment variables** (onglet _Production_ **et** _Preview_) :

| Variable       | Valeur | Rôle                                                          |
| -------------- | ------ | ------------------------------------------------------------- |
| `NODE_VERSION` | `22`   | Angular 22 exige Node ≥ 20.19 ; force une version compatible. |

> 🔎 **Important** : ces variables agissent au **build**, pas dans le navigateur.
> Une variable Cloudflare **n'atteint jamais** le JS côté client. L'URL de l'API
> (le jour où le back existe) doit être **bakée au build** via les
> `environment.ts` d'Angular, **ou** lue à l'exécution depuis un `config.json`
> servi en statique. Ne compte pas sur une env var Cloudflare pour ça.

---

## 4. Branche de production & preview deploys

- **Production branch** : choisis la branche qui représente la prod.
  - Recommandé : **`main`** → tu bosses sur `dev`, et tu « promeus » en prod par
    un merge `dev → main` (hygiène : la prod ne bouge que sur un acte délibéré).
  - Alternative si tu veux du déploiement continu direct : mets **`dev`** en
    production branch (chaque push `dev` redéploie la prod).
- **Preview deployments** : toute autre branche (et les PR) génère
  automatiquement une URL de preview `*.pages.dev` — pratique pour tester une
  feature avant merge.

Chaque push sur la branche de prod déclenche un **redéploiement automatique**.

---

## 5. Déployer

1. Cliquer **Save and Deploy**.
2. Cloudflare clone, `pnpm install` (racine), lance la build command, publie le
   contenu de `…/browser`.
3. À la fin : une URL **`https://<projet>.pages.dev`**. C'est en ligne.

**Vérifier** : ouvrir l'URL, naviguer, **recharger sur une route profonde** (ex.
`/boutique`) → doit afficher la page (grâce à `_redirects`), pas un 404.

---

## 6. Domaine personnalisé (optionnel)

Projet Pages → onglet **Custom domains** → **Set up a custom domain** → saisir le
domaine (ex. `pro.lafoliecoffee.com`). Si le DNS est déjà chez Cloudflare, le
record est créé automatiquement ; sinon suivre les instructions CNAME. HTTPS est
provisionné tout seul.

---

## 7. Quand le backend arrivera (rappel)

La sortie étant **100 % statique**, tous les appels API partent du **navigateur** :

- Le backend NestJS doit renvoyer les en-têtes **CORS** autorisant l'origine
  `https://<projet>.pages.dev` (et le domaine custom).
- En dev local, `http://localhost:PORT` marche depuis **ta** machine ; pour
  tester le site déployé contre ton back local depuis un autre appareil, expose
  le back : `cloudflared tunnel --url http://localhost:PORT`.
- Le backend vit en **process Node always-on** (Railway / Render / Fly), pas en
  serverless — voir la note d'architecture DB/backend.

---

## Récapitulatif express

|                |                                                                         |
| -------------- | ----------------------------------------------------------------------- |
| Build command  | `pnpm --filter lfc-b2b-platform-frontend build:cloudflare`              |
| Output dir     | `apps/lfc-B2B-platform-frontend/dist/lfc-b2b-platform-frontend/browser` |
| Root directory | `/`                                                                     |
| `NODE_VERSION` | `22`                                                                    |
| SPA routing    | `public/_redirects` (déjà là)                                           |
| Prod branch    | `main` (recommandé)                                                     |

## Dépannage

- **Page blanche / 404 sur reload d'une sous-route** → `_redirects` non pris en
  compte : vérifier qu'il est bien dans `public/` (donc copié dans `…/browser/`).
- **Build échoue sur `fold-ng` introuvable** → Root directory n'est pas `/`
  (l'install ne résout pas le `catalog:`). Remettre la racine du repo.
- **Erreur Node / syntaxe** → `NODE_VERSION` absente ou trop basse : mettre `22`.
- **Un `server/` apparaît dans la sortie** → tu as buildé le défaut SSR, pas la
  config `cloudflare`. Vérifier la build command.
