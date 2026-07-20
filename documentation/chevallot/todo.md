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

## Décisions fermées récemment

- ✅ **Monorepo Turborepo** (pas Nx) → [ADR-08](./adr.md#adr-08--monorepo-turborepo--pnpm-pas-nx)
- ✅ **Base Neon** (pas Prisma Postgres Free) → [ADR-09](./adr.md#adr-09--base-neon-pas-prisma-postgres-free)
- ✅ **Backend ESM + flags stricts** → [ADR-10](./adr.md#adr-10--backend-esm--flags-ts-stricts-partagés)

## Backlog technique

### Fondations
- [x] Squelette monorepo (pnpm + Turborepo), apps front/back scaffoldées + versions alignées
- [x] Couche de flags TS backend partagée (`tsconfig/tsflags.backend.json`)
- [x] Conf de test : Jest (back, ESM→CJS) + Vitest (front)
- [x] Repo distant privé `hugoheynard/lfd`, branche `dev`
- [ ] Lib `packages/shared-types` (DTOs partagés front/back, source de vérité TS)
- [ ] Lib UI `packages/ui` (design system, à venir)

### Domaine & données
- [x] Slice **allergènes** GS1→INCO (galop d'essai, domaine pur + tests)
- [ ] **Peupler les vrais codes GS1** depuis `ref.gs1.org/voc/AllergenTypeCode` (actuellement provisoires)
- [ ] Envelopper le domaine allergènes en provider Nest (ou extraire `libs/allergen-mapping`)
- [ ] **Schéma Prisma** dérivé du modèle de données (`data-model/`)
- [ ] Porter dans le repo les docs `data-model/` 02→05 (déjà rédigées côté cadrage)

### Intégrations (adaptateurs `ChannelAdapter`)
- [ ] Contrat d'intégration **PI Helios** (bloqué par D4)
- [ ] Adaptateur **Shopify** (push Admin API + webhooks stock/commandes)
- [ ] Adaptateur **B2B / GDSN** (export fiches, pass-through GS1)

## Prochaine étape en cours

➡️ **Détailler l'anatomie d'un produit premium** → [`data-model/01-produit.md`](./data-model/01-produit.md)
