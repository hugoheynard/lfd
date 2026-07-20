# Chevallot PIM — Documentation

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

### Modèle de données (couches)

Trois rythmes de vie différents, à ne jamais confondre :

Le **produit** (identité) au centre ; les autres concerns sont des **couches** posées autour, chacune
son doc et son rythme de vie. Substrat transverse : l'**event store** (ADR-11).

| Couche | Doc | Rôle |
|---|---|---|
| 🧩 **Identité (socle)** | [`data-model/02-catalogue-items.md`](./data-model/02-catalogue-items.md) | Le **quoi** — `Product` / `ProductVariant` / `Category` |
| 🥗 **Réglementaire** | [`data-model/03-nutrition.md`](./data-model/03-nutrition.md) | Nutrition + **allergènes** (GS1 → INCO, [code](../../apps/chevallot-PIM-backend/src/allergens)) |
| ✍️ **Éditorial** | [`data-model/01-produit.md`](./data-model/01-produit.md) | Récit, provenance, labels, médias, SEO |
| 💶 **Prix** | *à porter* | Le **combien** — par canal + TVA |
| 📅 **Disponibilité** | *à porter* | Le **quand** — capacité, créneaux, cut-off (pas un stock) |
| 📡 **Publication** | *à porter* | Le **comment ça se propage** — brouillon → push, diff, ids externes |
| 🗄️ **Event store** *(transverse)* | [`adr.md` ADR-11](./adr.md#adr-11--catalogue-event-sourced-event-store-dès-le-départ) | Source de vérité, historique, replay |

## Démarrer en local

```bash
pnpm install                       # deps (génère le client Prisma au postinstall)
pnpm dev:infra                     # Postgres 17 dans Docker (port hôte 5433)
cp apps/chevallot-PIM-backend/.env.example apps/chevallot-PIM-backend/.env
pnpm chevallot-suite:dev:watch     # front (4200) + back (3100) en watch
```

`pnpm dev:infra:down` arrête la base (données gardées) · `dev:infra:nuke` détruit le volume.
En prod la même `DATABASE_URL` pointera sur **Neon** (ADR-09) — seul l'URL change.

## Stack (résumé — détail dans [`adr.md`](./adr.md))

Angular (SPA, Vitest) · NestJS (ESM, Jest) · monorepo **Turborepo** + pnpm · **Prisma** ORM ·
**PostgreSQL** managé (**Neon**) · monolithe modulaire, un seul déployable long-running.
