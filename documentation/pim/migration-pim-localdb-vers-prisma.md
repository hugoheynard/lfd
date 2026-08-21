# Migration PIM : LocalDb (POC) → Prisma (backend NestJS)

> **But.** Sortir le front PIM du `LocalDb` (POC navigateur, localStorage, seed
> embarqué) et le brancher sur le **vrai backend NestJS + Prisma/Postgres**. La
> décision : « on en profite pour le passer sur le Prisma », prise pendant la
> refonte de la page produit (édition + conditionnements + prix canonique).
>
> Statut : **plan.** Date : 2026-08-04.
> Voisins : [`architecture-conditionnements-pricing.md`](../b2b/architecture-conditionnements-pricing.md),
> [`audit-catalogue-boutique-b2b.md`](../b2b/audit-catalogue-boutique-b2b.md).

## Le point de départ

- **Le front PIM tourne 100 % sur `LocalDb`** (`app/data/local-db.ts`) : un
  `signal<DbShape>` seedé depuis `db.seed.ts`, recopié dans `localStorage`. Zéro
  HTTP. `provideHttpClient(withFetch())` est **déjà** fourni (`app.config.ts`) —
  l'infra HTTP existe, rien à installer.
- Services front sur LocalDb : `catalogue-api.ts`, `publication-api.ts`,
  `shopify-api.ts`, `shopify-channel-api.ts`, `emplacement-list`,
  `collections-page`, `tva-rates/*`, `data/api.ts`.
- **Le backend persiste bien via Prisma**, mais n'expose qu'un sous-ensemble :
  catégories (list/create/rename/archive), produits (list/get/create/rename/
  archive). Controller `@Public()` temporaire (Auth0 pas encore câblé) → joignable
  sans auth en dev.

## L'écart réel (le LocalDb est un SUR-ENSEMBLE)

Le `DbShape` du POC couvre 5 domaines. Le Prisma backend n'en couvre proprement
qu'un (produits/catégories, sans les champs commerce).

| Domaine front (LocalDb)                                                                                                             | Backend Prisma                                                                       | Écart                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| **Produits** list/get/create/rename/archive                                                                                         | ✅                                                                                   | mécanique (rewire HTTP)       |
| **Produits — champs** `priceEur`, `weightGrams`, `descriptionFr`, `channelsOverride`, `slug`, `workflowFlags`, `variants.allergens` | ❌ Product sans prix ni canaux ; allergènes = `NutritionDeclaration` (satellite)     | colonnes + events + endpoints |
| **Produits** `deleteProduct`                                                                                                        | ❌ R3 : pas de DELETE physique                                                       | rester sur archive            |
| **Catégories** list/create/rename/archive                                                                                           | ✅                                                                                   | mécanique                     |
| **Catégories — champs** `channelPreset` (b1/b2 × emporter/surPlace), `emporterTvaId`/`surPlaceTvaId`                                | ❌                                                                                   | colonnes/relation + events    |
| **Taux de TVA** list/create/update/delete                                                                                           | ❌ **modèle inexistant**                                                             | domaine backend entier        |
| **Emplacements** (boutiques + modes + tables + QR) list/create/update/delete/generateTableQr/removeTableQr                          | ❌ **modèle inexistant**                                                             | domaine backend entier        |
| **Publication / Shopify** bindings, `bindingHashes`, `publishedFiches`, `scheduledPush`, settings                                   | 🟡 `ShopifyProductBinding`/`ShopifyVariantBinding` (ADR-13), module channels partiel | aligner + compléter           |

## Deux vérités structurantes

1. **« Tout le PIM » = construire ~2 domaines backend neufs (TVA, emplacements) +
   en étendre 3.** Chacun avec sa règle event-sourcing + ADRs + tests (conventions
   PIM backend). Ce n'est pas une passe, c'est plusieurs jours.
2. **Une migration partielle casse l'app.** Basculer les produits sur le backend
   alors que le `Product` Prisma n'a ni `priceEur` ni `channelsOverride` viderait
   la boutique et les fiches. Règle : **chaque domaine passe COMPLET, backend
   d'abord**, puis on coupe LocalDb pour ce domaine — jamais l'inverse.

## Décision de frontière (verrouillée 2026-08-04 : contextes séparés)

`channelPreset`, taux de TVA, emplacements sont des concepts **canaux /
commerce**, pas catalogue. Le backend a été dessiné **channel-agnostic** exprès
(Shopify = binding séparé, ADR-13). Les migrer verbatim en colonnes sur
`Product`/`Category` importerait la dette de modélisation du POC.

**Décidé :** contextes **séparés** dans le backend — un module commerce/`channels`
(taux TVA + presets de canaux), un module `locations` (emplacements + tables +
QR) — plutôt que des colonnes sur `Product`/`Category`. La TVA et les canaux se
**référencent** depuis la catégorie, ils n'y vivent pas. Conséquence pour slice 1 :
`channelsOverride` ne va PAS sur `Product` ; il est traité avec le contexte
commerce (slice 2/4), pas dans l'édition produit de base.

### Slice 0 — recon (fait)

- DB PIM `lfc_pim` sur `localhost:5433`, joignable, 5 migrations à jour. Back `:3100`.
- **Aucun seed Prisma** → à créer, aligné sur `SEED_PRODUCTS` (92 réfs).
- Backend = DDD propre (application-service → repository port → adapter Prisma),
  **pas event-sourcé**. Générateur `prisma-client` (émet du TS).

### Slice 1 — homes des champs produit

- `priceEur` (produit, POC) → `ProductVariant.priceCents Int?` (canonique, HT, EUR
  — l'unité EST une variante, cf. note conditionnements).
- `weightGrams` → `ProductVariant.weightGrams Int?` (fait physique de l'unité vendue).
- `descriptionFr` → `ProductEditorial.descriptionShort` (satellite existant).
- `allergens` (variant) → `NutritionDeclaration` (satellite existant, GS1).
- `channelsOverride` → **différé** (contexte commerce, slice 2/4).
- `workflowFlags` → `Product.attributes` JSON (différé, non requis par l'edit de base).

## Séquence (backend-first, domaine par domaine)

Chaque slice : (a) Prisma + domaine + commands/events backend + tests → (b)
endpoints → (c) rewire du service front correspondant vers HTTP → (d) suppression
de la branche LocalDb de ce domaine. On ne coupe LocalDb d'un domaine qu'une fois
sa parité backend atteinte.

- **Slice 0 — socle.** Vérifier la stack dev (Postgres + backend PIM up), le seed
  Prisma (parité avec les 92 réfs du POC), et poser un `HttpCatalogueClient`
  (base URL + gestion d'erreur → `CatalogueApiError`) sans encore débrancher.
- **Slice 1 — Produits (parité + rewire).** _(on commence ici)_ Prisma `Product`/
  `ProductVariant` gagnent le prix canonique (`priceCents` Int?, HT, EUR — cf.
  note conditionnements) + les champs manquants ou leur satellite ; endpoints
  d'édition par champ (nom, catégorie, kind, statut, prix, canaux…) ; front
  `CatalogueApi` produits → HTTP. Débloque la **page produit edit** + les
  **conditionnements/prix**.
- **Slice 2 — Catégories (parité).** `channelPreset` + refs TVA (dépend de slice
  4 pour les refs) ; rewire.
- **Slice 3 — Publication / Shopify.** Aligner `publication-api`/`shopify-*` sur
  les bindings backend existants.
- **Slice 4 — Taux de TVA.** Nouveau contexte commerce/channels.
- **Slice 5 — Emplacements.** Nouveau contexte locations (tables + QR rotatif).

## À trancher au fil de l'eau (pas bloquant maintenant)

- **Prix : variante ou produit ?** Note conditionnements → **par variante**
  (`priceCents` sur `ProductVariant`), l'unité EST une variante. Le front POC a
  `priceEur` sur le produit ; à réconcilier en slice 1.
- **Allergènes.** Front : `variant.allergens: string[] | null`. Backend :
  `NutritionDeclaration` (satellite optionnel, GS1). Le rewire mappe l'un sur
  l'autre, ne duplique pas.
- **Seed Prisma.** D'où viennent les 92 réfs en base dev ? Un seed Prisma aligné
  sur `SEED_PRODUCTS`, ou un import ponctuel. À cadrer en slice 0.
- **Auth.** `@Public()` reste tant que le tenant Auth0 n'existe pas ; à retirer
  quand `AUTH0_DOMAIN`/`AUTH0_AUDIENCE` sont là (dette `todo.md`).
