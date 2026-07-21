# Chevallot PIM — TODO & décisions ouvertes

> Ce qui reste à trancher (produit/métier) et à faire (technique). Les décisions **fermées** migrent
> vers [`adr.md`](./adr.md).

## Décisions à trancher (produit / métier)

| # | Sujet | Enjeu | Statut |
|---|---|---|---|
| D1 | **Nature exacte du B2B** | Revente pros (cafés, restaurants, collectivités) confirmée ? Paliers de volume + tarifs négociés par client → conditionne le modèle pricing (couche 02) | 🔴 ouvert |
| D2 | **Plan de production labo : auto ou manuel ?** | Consolidation auto de la demande multi-canal → plan, ou planification manuelle assistée ? Conditionne la couche 03 | 🔴 ouvert |
| D3 | **Périmètre recettes / BOM** | Nomenclatures matières dans le scope v1 (calcul besoins farine…) ou plus tard ? | 🔴 ouvert |
| D4 | **Accès PI Electronique / Helios** | API contractuelle **ou** export fichier (CSV/XML) ? **Principal inconnu technique** — conditionne l'adaptateur PI | 🔴 ouvert |
| D5 | **TVA** | Taux paramétrables + distinction emporter / sur place — à confirmer avec le comptable | 🟠 à confirmer |
| ~~D6~~ | ~~**Frontières d'agrégat**~~ | **Clos le 2026-07-21** → `Product` racine (possède déclinaisons + fiches réglementaires), `Category`, `Collection`, `MediaAsset` | ✅ fermé |

## Décisions fermées récemment

- ✅ **Frontières d'agrégat (D6)** → [`data-model/00-langage-et-comportement.md`](./data-model/00-langage-et-comportement.md#2--agrégats--la-décision-ex-d6)
- ✅ **Event store préparé, pas activé** → [ADR-11 révisé](./adr.md#adr-11--catalogue-orienté-comportement--event-store-préparé-pas-activé)
- ✅ **Composition par satellites, canaux au bord** → [ADR-13](./adr.md#adr-13--composition-par-tables-satellites-canaux-au-bord)
- ✅ **Logistique / GDSN descopée v1** → [ADR-14](./adr.md#adr-14--couche-logistique-descopée-de-la-v1)
- ✅ **Monorepo Turborepo** (pas Nx) → [ADR-08](./adr.md#adr-08--monorepo-turborepo--pnpm-pas-nx)
- ✅ **Base Neon** (pas Prisma Postgres Free) → [ADR-09](./adr.md#adr-09--base-neon-pas-prisma-postgres-free)
- ✅ **Backend ESM + flags stricts** → [ADR-10](./adr.md#adr-10--backend-esm--flags-ts-stricts-partagés)

## Backlog technique

### Fondations
- [x] Squelette monorepo (pnpm + Turborepo), apps front/back scaffoldées + versions alignées
- [x] Couche de flags TS backend partagée (`tsconfig/tsflags.backend.json`)
- [x] Conf de test : Jest (back, ESM→CJS) + Vitest (front)
- [x] Repo distant privé `hugoheynard/lfd`, branche `dev`
- [x] **Prisma** + Postgres local Docker (`pnpm dev:infra`, port 5433) — infra dans `src/infra/database/`
- [x] **Auth0 côté API** — guard global `jose`, `@Public()` / `@CurrentUser()` (ADR-12)
- [ ] **Créer le tenant Auth0** + une *API* (son Identifier = l'audience), puis renseigner
      `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` — sans ça, aucun jeton n'est validé
- [ ] Table `User` interne (notre id ↔ `sub` Auth0) — découple le domaine de l'IdP
- [ ] Câblage **front Angular** : `@auth0/auth0-angular` (PKCE) + interceptor qui porte le token
- [ ] Passerelle de configuration **côté front** — permettrait de retirer la dérogation
      `src/server.ts` du gate `no-direct-env`
- [ ] Lib `packages/shared-types` (DTOs partagés front/back, source de vérité TS)
- [ ] Lib UI `packages/ui` (design system, à venir)

### Domaine & données
- [x] **Langage ubiquitaire + commandes/faits + agrégats** (clôt D6) → [`00-langage-et-comportement.md`](./data-model/00-langage-et-comportement.md)
- [ ] **Schéma Prisma du socle** — `product`, `product_variant`, `category`, `collection`,
      `product_collection`, `nutrition_declaration` (PK=FK) — **débloqué**
- [ ] Handlers de commande nommés (§3 du doc 00) + garde `PublishProduct` sans fiche réglementaire
- [ ] **UUID v7 applicatif** (R1) — un `IdGenerator` injecté, jamais de défaut base
- [ ] Event store append-only : **différé** (ADR-11 révisé). Déclencheur = premier besoin d'as-of réel
- [x] Slice **allergènes** GS1→INCO (galop d'essai, domaine pur + tests)
- [ ] **Peupler les vrais codes GS1** depuis `ref.gs1.org/voc/AllergenTypeCode` (actuellement provisoires)
- [ ] Envelopper le domaine allergènes en provider Nest (ou extraire `libs/allergen-mapping`)
- [ ] Porter dans le repo les docs de cadrage restantes : pricing, disponibilité, `05-allergenes`
- [ ] Couches satellites au fil du besoin : `product_editorial`, `product_certification`,
      `media_asset` + liaisons (PK=FK, cf. ADR-13)

### Intégrations (adaptateurs `ChannelAdapter`)
- [ ] Contrat d'intégration **PI Helios** (bloqué par D4) → `helios_*_binding`, dont le
      `pos_family_code` et le **code-barres** (sortis du socle, ADR-13/14)
- [ ] Adaptateur **Shopify** (push Admin API + webhooks stock/commandes) → `shopify_*_binding`
      + `shopify_product_override`
- [ ] Port de lecture `CatalogueReader` — les adaptateurs ne lisent **jamais** les tables du socle
- [ ] Adaptateur **B2B** (export fiches, pass-through GS1) — sans hiérarchie GDSN (ADR-14)

## Prochaine étape en cours

➡️ **Schéma Prisma du socle** (débloqué par la clôture de D6) — dérivé de
[`data-model/02-catalogue-items.md`](./data-model/02-catalogue-items.md)
