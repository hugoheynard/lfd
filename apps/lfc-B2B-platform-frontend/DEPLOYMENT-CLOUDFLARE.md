# Déploiement — Cloudflare Pages

Le B2B se déploie comme un **SPA statique** (browser-only, pas de SSR) sur
**Cloudflare Pages**. Pour le _pourquoi_ (statique vs SSR, appels API), voir le
[README](./README.md).

**Méthode retenue : CI (GitHub Actions).** On build + gate dans notre CI, puis on
pousse les fichiers à Cloudflare (Direct Upload) — Cloudflare ne fait
qu'**héberger**. C'est plus robuste que laisser Cloudflare builder (contrôle total
du toolchain monorepo, un build rouge ne déploie jamais, cohérent avec fold-ng).
La méthode « Git integration » (build côté Cloudflare) reste possible et est
décrite en [annexe](#annexe--git-integration-build-côté-cloudflare).

> ⚠️ **Le piège à retenir** : le build **par défaut** (`ng build`) est **SSR**
> (`outputMode: server`). Pages ne sert que du statique → il faut la configuration
> `cloudflare` (script `build:cloudflare`). Le workflow s'en charge déjà ; ne
> déploie jamais un build par défaut.

---

## Méthode CI — `.github/workflows/deploy_b2b_frontend_platform.yml`

Le workflow (déjà présent dans le repo) fait, à chaque push sur **`main`** :

1. `pnpm install --frozen-lockfile` (racine du workspace),
2. **gate** : `tsc --noEmit` (typecheck),
3. `ng build --configuration cloudflare` (sortie statique `…/browser`),
4. `wrangler pages deploy … --project-name=lfc-b2b --branch=main` (→ prod).

Un typecheck ou un build rouge **stoppe** avant tout déploiement.

### Ce que TU dois faire une seule fois (je ne peux pas le faire à ta place)

#### 1. Créer le projet Pages en mode « Direct Upload »

Deux options :

- **Dashboard** : dash.cloudflare.com → **Workers & Pages** → **Create** →
  onglet **Pages** → **Upload assets** (= Direct Upload, _pas_ Connect to Git) →
  nommer le projet **`lfc-b2b`** → créer (tu peux uploader un dossier vide, la CI
  écrasera au premier deploy).
- **ou CLI** :
  ```bash
  npx wrangler pages project create lfc-b2b --production-branch=main
  ```

> Le nom **`lfc-b2b`** doit correspondre à `--project-name` dans le workflow. Si
> tu changes l'un, change l'autre.

#### 2. Récupérer un API token + l'Account ID

- **API token** : dash.cloudflare.com → **My Profile** → **API Tokens** →
  **Create Token** → **Create Custom Token**. Permission :
  **Account · Cloudflare Pages · Edit**. (Optionnel : restreindre à ton compte.)
  Copier le token (affiché une seule fois).
- **Account ID** : visible dans **Workers & Pages** (colonne de droite) ou dans
  l'URL du dashboard.

#### 3. Poser les 2 secrets sur le repo GitHub `lfd`

GitHub → repo **`hugoheynard/lfd`** → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret** :

| Secret                              | Valeur                    |
| ----------------------------------- | ------------------------- |
| `CLOUDFLARE_API_TOKEN_B2B_PLATFORM` | le token créé à l'étape 2 |
| `CLOUDFLARE_ACCOUNT_ID`             | ton Account ID            |

> **Convention de nommage** — ce repo héberge plusieurs apps static (B2B, PIM,
> futur B2B admin) qui déploient toutes depuis `lfd`. Le token est donc **suffixé
> par app** (`…_B2B_PLATFORM`) pour les révoquer/roter indépendamment. L'**Account
> ID**, lui, est **partagé** (un seul compte Cloudflare) → un seul
> `CLOUDFLARE_ACCOUNT_ID` pour tout le monde. Le PIM aura son
> `CLOUDFLARE_API_TOKEN_PIM`, etc.

### Déclencher un déploiement

- **Auto** : un push sur **`main`** lance le workflow **uniquement** s'il touche
  `apps/lfc-B2B-platform-frontend/**` ou `pnpm-workspace.yaml` (le pin `catalog:`
  fold-ng). Bosser sur le **PIM ne redéploie pas** le B2B — même si tu installes
  une dépendance PIM (le lockfile n'est **pas** dans le trigger).
- **Manuel** : onglet **Actions** du repo → workflow **deploy_b2b_frontend_platform**
  → **Run workflow**.

Tu bosses sur `dev` → la prod ne bouge que quand tu **merges `dev → main`**
(hygiène : la prod = un acte délibéré).

### Vérifier

Après le run vert : ouvrir `https://lfc-b2b.pages.dev`, naviguer, **recharger sur
une route profonde** (ex. `/boutique`) → la page s'affiche (grâce à
`public/_redirects`), pas un 404.

---

## Domaine personnalisé (optionnel)

Projet Pages → onglet **Custom domains** → **Set up a custom domain** → saisir le
domaine (ex. `pro.lafoliecoffee.com`). DNS déjà chez Cloudflare → record créé
automatiquement ; sinon suivre le CNAME. HTTPS provisionné tout seul.

---

## Quand le backend arrivera (rappel)

Sortie **100 % statique** → tous les appels API partent du **navigateur** :

- Le backend NestJS doit renvoyer les en-têtes **CORS** autorisant l'origine
  `https://lfc-b2b.pages.dev` (et le domaine custom).
- L'URL de l'API se **bake au build** (`environment.ts`) ou se lit depuis un
  `config.json` statique — une env var Cloudflare **n'atteint pas** le navigateur.
- En dev, `http://localhost:PORT` marche depuis **ta** machine ; pour tester le
  site déployé contre ton back local depuis ailleurs :
  `cloudflared tunnel --url http://localhost:PORT`.
- Le backend vit en **process Node always-on** (Railway / Render / Fly), pas en
  serverless.

---

## Récapitulatif express

|                |                                                                         |
| -------------- | ----------------------------------------------------------------------- |
| Méthode        | CI GitHub Actions → Direct Upload                                       |
| Workflow       | `.github/workflows/deploy_b2b_frontend_platform.yml`                    |
| Projet Pages   | `lfc-b2b` (Direct Upload)                                               |
| Secrets repo   | `CLOUDFLARE_API_TOKEN_B2B_PLATFORM`, `CLOUDFLARE_ACCOUNT_ID`            |
| Build interne  | `ng build --configuration cloudflare`                                   |
| Sortie publiée | `apps/lfc-B2B-platform-frontend/dist/lfc-b2b-platform-frontend/browser` |
| Déploie sur    | push `main` (ou Run workflow)                                           |
| SPA routing    | `public/_redirects` (déjà là)                                           |

---

## Dépannage

- **Le workflow échoue à `wrangler pages deploy` (project not found)** → le projet
  `lfc-b2b` n'existe pas encore : créer le Direct Upload (étape 1).
- **`Authentication error` wrangler** → secret `CLOUDFLARE_API_TOKEN_B2B_PLATFORM`
  absent/mauvaise permission (il faut **Pages · Edit**) ou `CLOUDFLARE_ACCOUNT_ID`
  faux.
- **Build échoue sur `fold-ng` introuvable** → install pas lancé à la racine du
  workspace (le workflow le fait déjà avec `pnpm install` à la racine).
- **404 au reload d'une sous-route** → `_redirects` absent de `public/` (donc de
  `…/browser/`).
- **Un `server/` dans la sortie** → build par défaut (SSR) au lieu de
  `--configuration cloudflare`.

---

## Annexe — Git integration (build côté Cloudflare)

Alternative sans CI : Cloudflare clone le repo et build lui-même. Plus simple mais
tu perds le gate et le contrôle du toolchain monorepo.

Workers & Pages → **Create** → **Pages** → **Connect to Git** → repo `lfd`, puis :

| Champ Cloudflare            | Valeur                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| Framework preset            | `None`                                                                  |
| Build command               | `pnpm --filter lfc-b2b-platform-frontend build:cloudflare`              |
| Build output directory      | `apps/lfc-B2B-platform-frontend/dist/lfc-b2b-platform-frontend/browser` |
| Root directory _(advanced)_ | `/` (racine — sinon le `catalog:` fold-ng ne se résout pas)             |
| Env var `NODE_VERSION`      | `22` (Angular 22 exige Node ≥ 20.19)                                    |

Production branch = `main` (les autres branches → preview `*.pages.dev`).
**Ne pas** combiner les deux méthodes sur le même projet (elles se marcheraient
dessus) : choisis CI **ou** Git integration.
