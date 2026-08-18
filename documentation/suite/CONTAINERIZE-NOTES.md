# Containerisation des backends (PIM & B2B) — checklist du 1er deploy

> ⚠️ **SUPERSÉDÉ le 2026-08-13.** Notes de containerisation écrites avant le
> premier déploiement. Ce qu'elles anticipaient est tranché — et parfois
> autrement. La référence à jour est [`../ops/`](../ops/README.md).
>
> Conservé pour l'historique : les pièges qu'elles avaient prévus (contexte de
> build à la racine, `pnpm deploy`) se sont bien produits.

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
   cd apps/lfd-api
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

## Migrer une base VIVANTE

Un déploiement n'est pas atomique : entre `prisma migrate deploy` et le
`wrangler deploy` qui suit, **l'ancien code sert le trafic contre le nouveau
schéma**. Tout ce qui va suivre découle de cette phrase.

L'étape de migration est donc placée **le plus tard possible avant le deploy**
(après le build et le push de l'image) : la fenêtre tombe de plusieurs minutes —
la durée d'un `docker build` — à quelques secondes. Elle ne disparaît pas.

**La règle : une migration ne doit jamais retirer ce que le code EN LIGNE lit
encore.** Ajouter est sûr ; retirer et renommer ne le sont pas.

Déplacer une donnée (une colonne qui change de table) se fait donc en **trois
déploiements**, et non en une migration :

|                  | Migration                               | Code                                           |
| ---------------- | --------------------------------------- | ---------------------------------------------- |
| **1. Étendre**   | crée la cible + **recopie** les données | écrit dans les **deux**, lit encore l'ancienne |
| **2. Basculer**  | —                                       | lit la **nouvelle**                            |
| **3. Resserrer** | `DROP COLUMN`                           | ne connaît plus l'ancienne                     |

Le prix est la double écriture temporaire à l'étape 1. Le bénéfice : aucune
étape ne casse sa voisine, et le retour arrière reste possible tant que le `DROP`
n'a pas eu lieu — l'ancienne colonne est encore là, et à jour.

⚠️ **Prisma ne déduit jamais un déplacement** : il voit une colonne qui disparaît
et une autre qui apparaît, et génère un `DROP` + un `ADD` sans lien. En dev
`migrate dev` prévient ; en CI `migrate deploy` applique en silence et la donnée
est perdue. Le transfert s'écrit **à la main**, dans le fichier `.sql` :

```bash
pnpm exec prisma migrate dev --create-only --name <nom>   # écrit sans appliquer
```

Référence à recopier — les cinq colonnes `rep_*` de `companies` vers
`company_contacts`, avec créer / recopier / supprimer dans une seule
transaction : `prisma/migrations/20260730065832_company_contacts/migration.sql`.
(Fait en un temps, car la base était alors vide de clients.)

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
