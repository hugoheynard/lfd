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
| [`adr.md`](./adr.md) | Décisions d'architecture figées (format ADR) — le **pourquoi** technique |
| [`todo.md`](./todo.md) | Décisions ouvertes + backlog — ce qui reste à trancher / faire |
| [`data-model/`](./data-model/) | Le modèle de données détaillé, par couche |

### Modèle de données (couches)

Trois rythmes de vie différents, à ne jamais confondre :

| Couche | Doc | Rôle |
|---|---|---|
| **Catalogue (socle)** 🔒 | [`data-model/02-catalogue-items.md`](./data-model/02-catalogue-items.md) | **Figé** — `Product` / `ProductVariant` / `Category`, le **quoi** |
| **Catalogue (premium)** | [`data-model/01-produit.md`](./data-model/01-produit.md) | Enrichissement éditorial — récit, provenance, labels, médias |
| **Prix** | `data-model/02-pricing-canaux.md` *(à porter)* | Le **combien** — par canal, jamais un attribut produit |
| **Disponibilité** | `data-model/03-disponibilite-production.md` *(à porter)* | Le **quand / combien produire** — capacité, pas stock |
| **Publication** | `data-model/04-publication-versioning.md` *(à porter)* | Le **comment ça se propage** — brouillon → push, diff |
| **Allergènes** | `data-model/05-allergenes-gs1-inco.md` *(à porter)* | Stockage GS1 → projection INCO ([code en place](../../apps/chevallot-PIM-backend/src/allergens)) |

## Stack (résumé — détail dans [`adr.md`](./adr.md))

Angular (SPA, Vitest) · NestJS (ESM, Jest) · monorepo **Turborepo** + pnpm · **Prisma** ORM ·
**PostgreSQL** managé (**Neon**) · monolithe modulaire, un seul déployable long-running.
