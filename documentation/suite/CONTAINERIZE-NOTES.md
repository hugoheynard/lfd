# Containerisation des backends (PIM & B2B) — checklist du 1er deploy

> Scaffold posé (wrangler.jsonc + Dockerfile + container/worker.ts pour chaque
> backend). **Non validé** : le build Docker n'a pas été exécuté. Ce qui suit est
> ce qu'il faut vérifier/ajuster au **premier `wrangler deploy` réel** (machine
> avec Docker). Schéma Containers récent → revérifier la doc Cloudflare à jour.

## État (ce qui est déjà fait)

- ✅ `@cloudflare/containers`, `wrangler`, `@cloudflare/workers-types@^5` ajoutés aux
  deux backends (lockfile à jour).
- ✅ `container/worker.ts` **typecheck**. B2B : instance nommée (`getContainer`) ;
  PIM : réparti (`getRandom`). Cf. « Rappels d'archi ».
- ✅ Backends `tsc --noEmit` verts ; `app.listen(port, "0.0.0.0")` explicite.
- ✅ Ymls pointent le wrangler **pinné** (`pnpm exec wrangler deploy`).

## Prérequis à faire une fois (par backend)

1. **Secrets GitHub** : `LFC_PIM_BACKEND_WORKER`, `LFC_B2B_BACKEND_WORKER`
   (créés ✅), + `CLOUDFLARE_ACCOUNT_ID` si absent du repo.
2. **Secrets RUNTIME du Worker** (≠ secrets GitHub) — posés une fois, ils arrivent
   comme variables d'env au container :
   ```bash
   cd apps/lfc-B2B-platform-backend
   pnpm exec wrangler secret put DATABASE_B2B_URL
   pnpm exec wrangler secret put STRIPE_SECRET_KEY
   pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET
   # + Auth0 (AUTH0_*), etc.
   ```

## Les 5 points fragiles à valider

1. **Contexte de build ✅ résolu (option a implémentée).** Les ymls font
   `docker build -f apps/<app>/Dockerfile -t <app>:latest .` **depuis la racine**
   (contexte complet), puis `wrangler containers push <app>:latest` (auth auto), et
   l'`image` du wrangler.jsonc = `registry.cloudflare.com/__CF_ACCOUNT_ID__/<app>:latest`
   (l'account id est injecté par `sed` au deploy depuis le secret). **À vérifier au
   1er run** : le comportement exact de `wrangler containers push <tag-local>` (nom
   d'image attendu / URI de sortie) — ajuster le tag si wrangler impose son préfixe.
2. **`pnpm --filter … deploy --prod /app`** : confirmer qu'il embarque bien le `dist/`
   **et** le client Prisma généré (dans `src/infra/database/client` → compilé dans
   `dist`). Si non, ajuster (copier explicitement le client, ou `pnpm deploy --legacy`).
3. **Port** : NestJS lit `PORT` (défaut 3200) ; l'image force `PORT=8080` et le
   Worker route sur `defaultPort=8080`. Garder ces trois alignés.
4. **`instance_type`** : démarré en `basic` (1/4 vCPU, 1 Gi). Si Node+Nest serre en
   RAM au boot, passer à `standard-1` (4 Gi).
5. **DB & connexions** : chaque instance a son pool. À une instance (le cas B2B),
   un pool suffit ; le jour où `max_instances` remonte, prévoir un **pooler**
   (PgBouncer / pooler hébergeur) pour ne pas dépasser `max_connections`.

## Rappels d'archi (déjà tranchés)

- **B2B : UNE instance nommée (`getContainer(binding, "primary")`), tenue chaude
  par un cron `*/5` qui frappe `/health`.** Deux choses qu'on avait mal lues au
  départ : `sleepAfter = "1h"` est un délai d'**inactivité**, pas un maintien en
  éveil (une nuit de calme suffit à endormir le backend) ; et `getRandom(b, N)`
  **tire au sort**, sans aucune notion de charge — Cloudflare n'offre à ce jour
  aucun routage sensible à la charge (leur page _Scaling and Routing_ l'annonce
  au futur), et `max_instances` n'est qu'un plafond de facturation. À trafic
  faible, deux instances tirées aux dés = deux machines tièdes et une requête sur
  deux qui démarre à froid ; une seule instance chaude fait strictement mieux,
  pour le même prix (~7 $/mois).
- **Montée en charge, dans cet ordre et chacune sur une MESURE** (latence en
  hausse, CPU au plafond) : (1) `instance_type: "standard-1"` — grossir avant de
  multiplier, un process Node profite mieux d'un demi-vCPU que d'un second
  container à router ; (2) `max_instances: 2` + routage par compteur de requêtes
  en vol tenu dans le DO primaire ; (3) si on dépasse vraiment la plateforme,
  Cloud Run (autoscaling à la concurrence + `min-instances: 1`) — **pas**
  Kubernetes, dont le coût d'opération n'a aucun sens à une personne.
- Le PIM reste sur `getRandom` : backoffice interne, où un démarrage à froid
  occasionnel est acceptable. À revoir si l'usage devient quotidien.
- Le Worker ne fait que router ; toute la logique reste dans l'image NestJS.
- Les deux workflows `deploy_pim_backend.yml` / `deploy_b2b_backend.yml` lancent
  `wrangler deploy` sur push `main` touchant le backend concerné.
