# LFC PIM — Documentation

PIM (Product Information Management) **source de vérité unique** du catalogue de la boulangerie
Chevallot (Val d'Isère, avec labo de production). Le catalogue **descend** vers les canaux de vente
(caisse **PI / Helios**, click & collect **Shopify**, **B2B**) ; les commandes **remontent** vers le
plan de production du labo.

> **Principe directeur** : canonique au centre, adaptateurs en projection. Le PIM ne connaît pas le
> vocabulaire des plateformes — chaque canal reçoit une *projection* du modèle canonique.

## Comment lire

| Doc | Contenu |
|---|---|
| [`ledger.md`](./ledger.md) | **Journal de bord** — chaque ajout, résumé **PM** + **Tech**. Commence ici pour savoir où on en est |
| [`adr.md`](./adr.md) | Décisions d'architecture figées (format ADR) — le **pourquoi** technique |
| [`todo.md`](./todo.md) | Décisions ouvertes + backlog — ce qui reste à trancher / faire |
| [`data-model/`](./data-model/) | Le modèle de données détaillé, par couche |
| [`projection-shopify.md`](./projection-shopify.md) | **Projection Shopify** — emporter/sur place, TVA par collection, boutiques, QR, SKU partagé |
| [`shopify-connexion-setup.md`](./shopify-connexion-setup.md) | **Connexion Shopify (runbook)** — Dev Dashboard, client credentials, install, `.env`, pièges |
| [`shopify-e2e-strategy.md`](./shopify-e2e-strategy.md) | **Tests e2e Shopify réels (stratégie)** — dev store vs prod, harness gated, garantie par lint |
| [`shopify-api-map.md`](./shopify-api-map.md) | **Cartographie API Shopify** — besoin PIM → scope R/W · fonction · action · statut |

### Modèle de données

Le **langage et les verbes** d'abord ; les tables ne sont qu'une conséquence. Puis le **produit**
(identité) au centre, et des **couches** posées autour — chacune son doc et son rythme de vie.

| | Doc | Rôle |
|---|---|---|
| 📖 **Langage & verbes** | [`data-model/00-langage-et-comportement.md`](./data-model/00-langage-et-comportement.md) | **À lire en premier** — glossaire, agrégats, commandes & faits, cycle de vie |
| 🧩 **Identité (socle)** | [`data-model/02-catalogue-items.md`](./data-model/02-catalogue-items.md) | Le **quoi** — `Product` / `ProductVariant` / `Category` / `Collection`. **Fait seul autorité** |
| 🥗 **Réglementaire** | [`data-model/03-nutrition.md`](./data-model/03-nutrition.md) | **Allergènes** (GS1 → INCO, [code](../../apps/lfc-PIM-backend/src/allergens)) + nutrition, par **déclinaison** |
| ✍️ **Éditorial** | [`data-model/01-produit.md`](./data-model/01-produit.md) | Récit, provenance, labels, médias, SEO |
| 📡 **Composition & canaux** | [`data-model/04-composition-et-canaux.md`](./data-model/04-composition-et-canaux.md) | Comment on **étend** sans diluer : trois natures de table, bindings, overrides |
| 🔖 **Identifiants & SKU** | [`data-model/06-identifiants-et-sku.md`](./data-model/06-identifiants-et-sku.md) | `id` vs `sku` vs référence canal ; value object, SKU par défaut, unicité |
| 💶 **Prix** | *à porter* | Le **combien** — par canal + TVA |
| 📅 **Disponibilité** | *à porter* | Le **quand** — capacité, créneaux, cut-off (pas un stock) |
| ⚖️ **Logistique** | — | **Descopée v1** ([ADR-14](./adr.md#adr-14--couche-logistique-descopée-de-la-v1)) |

## Démarrer en local

```bash
pnpm install                       # deps (génère le client Prisma au postinstall)
pnpm dev:infra                     # Postgres 17 dans Docker (port hôte 5433)
cp apps/lfc-PIM-backend/.env.example apps/lfc-PIM-backend/.env
pnpm lfc-suite:dev:watch     # front (4200) + back (3100) en watch
```

`pnpm dev:infra:down` arrête la base (données gardées) · `dev:infra:nuke` détruit le volume.
En prod la même `DATABASE_URL` pointera sur **Neon** (ADR-09) — seul l'URL change.

## Stack (résumé — détail dans [`adr.md`](./adr.md))

Angular (SPA, Vitest) · NestJS (ESM, Jest) · monorepo **Turborepo** + pnpm · **Prisma** ORM ·
**PostgreSQL** managé (**Neon**) · monolithe modulaire, un seul déployable long-running.
