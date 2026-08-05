# LFC PIM — TODO & décisions ouvertes

> Ce qui reste à trancher (produit/métier) et à faire (technique). Les décisions **fermées** migrent
> vers [`adr.md`](./adr.md).

## Décisions à trancher (produit / métier)

| # | Sujet | Enjeu | Statut |
|---|---|---|---|
| D1 | **Nature exacte du B2B** | Revente pros (cafés, restaurants, collectivités) confirmée ? Paliers de volume + tarifs négociés par client → conditionne le modèle pricing (couche 02) | 🔴 ouvert |
| D2 | **Plan de production labo : auto ou manuel ?** | Consolidation auto de la demande multi-canal → plan, ou planification manuelle assistée ? Conditionne la couche 03 | 🔴 ouvert |
| D3 | **Périmètre recettes / BOM** | Nomenclatures matières dans le scope v1 (calcul besoins farine…) ou plus tard ? | 🔴 ouvert |
| D4 | **Accès PI Electronique / Helios** | API contractuelle **ou** export fichier (CSV/XML) ? **Principal inconnu technique** — conditionne l'adaptateur PI, le régime anti-drift, **et** la validité d'[ADR-15](./adr.md#adr-15--construire-un-pim-minimal-plutôt-quen-acheter-un). ➡️ **action : envoyer le questionnaire à PI** (8 questions, dont la n°4 — « peut-on déposer notre propre identifiant ? » — qui décide si le drift est accidentel ou structurel) | 🔴 ouvert |
| D7 | **Résolution des prix** | Par **spécificité** (la règle la plus précise gagne) ou par **priorité numérotée explicite** ? La 1ʳᵉ est plus élégante, la 2ᵈᵉ plus prévisible pour un commercial qui débogue seul | 🔴 ouvert |
| D5 | **TVA** | Taux paramétrables + distinction emporter / sur place — à confirmer avec le comptable | 🟠 à confirmer |
| ~~D6~~ | ~~**Frontières d'agrégat**~~ | **Clos le 2026-07-21** → `Product` racine (possède déclinaisons + fiches réglementaires), `Category`, `Collection`, `MediaAsset` | ✅ fermé |

## Actions de cadrage (hors code — ce qui débloque le plus vite)

- [ ] **Questionnaire PI Helios** (8 questions) → lève D4, et avec lui le pricing, l'anti-drift et
      la validité d'ADR-15
- [ ] **Spike Shopify — 1 journée, 0 €** : boutique de développement + app personnalisée → pousser
      **un** produit à 2 déclinaisons avec un metafield allergène, le modifier dans l'admin, vérifier
      qu'un **webhook** revient. Passe de « je crois » à « je sais », et prouve le régime *surveillé*
      côté Shopify
- [ ] **Matrice de propriété** champ × système (`W` / `R` / `—`), **un seul `W` par ligne** — le
      document anti-drift de référence
- [ ] Vérifier le **coût du B2B natif Shopify** (offre Plus) — conditionne D1
- [ ] Trancher le modèle de **disponibilité côté Shopify** : capacité de production projetée en stock
      quotidien remis à zéro, **ou** créneaux de retrait (touche le paramétrage de la boutique)

## Décisions fermées récemment

- ✅ **Construire plutôt qu'acheter** → [ADR-15](./adr.md#adr-15--construire-un-pim-minimal-plutôt-quen-acheter-un) *(testable : révision à D4 et D1)*
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
- [ ] Tables restantes du socle : `collection`, `product_collection`, `nutrition_declaration` (PK=FK)
- [x] **Value object `Sku`** + générateur de SKU par défaut (port `SkuAvailability`), 35 tests
      — [ADR-16](./adr.md#adr-16--un-sku-interne-unique--les-références-canal-vivent-au-bord)
- [x] **Catégories d'erreurs** `DomainError` / `BusinessError` / `TechnicalError`
- [x] **Filtre d'exceptions HTTP** — `domain` → 400, `business` → 409, `ResourceNotFound` → 404,
      `technical` → 500 (détail masqué + tracé). Aucune classe d'erreur ne connaît HTTP
- [x] Brancher `SkuAlreadyUsedError` sur la violation d'unicité **dans l'adaptateur de dépôt**
- [x] **Schéma Prisma du socle** + migration `socle_catalogue` (+ `sku_registry` : l'unicité
      globale du SKU ne pouvant pas s'exprimer sur deux tables)
- [x] **`IdGenerator` UUID v7** applicatif (R1), injecté — aucun défaut en base
- [x] **Verbes catalogue** : familles (créer / renommer / archiver) et produits
      (créer avec déclinaison par défaut / renommer / archiver)
- [x] **Back-office Angular** : écran Familles + tableau Produits (signals, zoneless, zéro `FormsModule`)
- [ ] 🔴 **Retirer le `@Public()` du contrôleur catalogue** dès qu'Auth0 est configuré — l'API
      catalogue est actuellement **ouverte** en local pour que le back-office fonctionne
- [ ] Tests des handlers (dépôts en double) — seul le domaine pur est couvert aujourd'hui
- [ ] `packages/shared-types` — le front redéclare aujourd'hui `Category` / `Product`
- [ ] Verbes manquants : `AddVariant`, `ChangeVariantSku`, `MoveCategory` (le contrôle de cycle
      est écrit et testable mais pas encore exposé), `PublishProduct` (gardé par les allergènes)
- [ ] Format du SKU (motif + longueurs + `normalize`) dans `packages/shared-types` — partage
      **à la compilation**, pas un registre runtime
- [ ] Event store append-only : **différé** (ADR-11 révisé). Déclencheur = premier besoin d'as-of réel
- [x] Slice **allergènes** GS1→INCO (galop d'essai, domaine pur + tests)
- [ ] 🔴 **Peupler les vrais codes GS1** depuis `ref.gs1.org/voc/AllergenTypeCode` — les 14
      catégories INCO sont exactes, **tous les codes sont provisoires** (`grep TBD_` + drapeau
      `provisional`). Bloquant avant tout export GDSN/B2B réel
- [x] **Fiche réglementaire** : table `nutrition_declaration` (PK=FK, optionnelle), validation dans
      le domaine (code inconnu, chevauchement, valeurs négatives), endpoint `/reference/allergens`
      (`scope=eu|world`), formulaire de création complet côté front
- [ ] Éditer la fiche d'un produit **existant** (aujourd'hui : seulement à la création)
- [ ] Garde `PublishProduct` : refuser la publication si une déclinaison active n'a pas de fiche
- [ ] Envelopper le domaine allergènes en provider Nest (ou extraire `libs/allergen-mapping`)
- [ ] Porter dans le repo les docs de cadrage restantes : pricing, disponibilité, `05-allergenes`
- [x] Couche **éditoriale** : `product_editorial` (PK=FK, optionnelle) + `media_asset` /
      `product_media` (liaison dédiée, pas de FK polymorphe) ; fiche en 3 cartes côté front
- [ ] **Envoi de fichiers** (R2/S3) — aujourd'hui on saisit une URL. Décision d'infra à prendre :
      fournisseur, nommage, dérivés de taille, ADR à écrire
- [ ] `product_certification` (labels : bio, IGP, AOP…) — `certifications` fait foi, pas de booléen
- [ ] Éditer l'éditorial d'un produit **existant** (aujourd'hui : seulement à la création)

### Intégrations (adaptateurs `ChannelAdapter`)
- [ ] Contrat d'intégration **PI Helios** (bloqué par D4) → `helios_*_binding`, dont le
      `pos_family_code` et le **code-barres** (sortis du socle, ADR-13/14)
- [x] **Seam Shopify** : écran Réglages, projection pure + empreinte, bindings produit/déclinaison,
      bouton Pousser (ligne + global), pilote `dry-run` par défaut ([ADR-17](./adr.md#adr-17--secrets-dintégration-hors-base--pilote-de-canal-derrière-un-port))
- [ ] **Pilote Shopify réel** — à écrire **après le spike** (boutique de dev + jeton). Ne touche que
      `shopify-driver.ts`. Y compris : metafield allergènes, et l'`id` de déclinaison déposé côté
      Shopify comme clé de jointure
- [ ] **Réconciliation à trois voies** ([`publication-reconciliation-3way.md`](./publication-reconciliation-3way.md)) — 5 slices :
  - [x] **S1** — `ShopifyPushSnapshot` (payload rejouable) + `headSnapshotId` sur binding + écriture au push + `GET /history` + `POST /rollback` *(29 tests, commits `623d6fa`/`be718cb`)*
  - [x] **S2** — dry-run **réel sans effet de bord** (`pushPayloadSchema.dryRun`, `previewOne`) *(commit `4f28738`)* ; bouton pré-push front reporté à S4
  - [x] **S3** — projection inverse THEIRS + `GET /reconciliation`(+`:handle`) + statuts (`local_ahead`/`remote_drift`/`conflict`/`to_remove`) *(dérive locale=empreinte pleine, distante=comparable ; commits `c01273f`/`841e967`, +20 tests)*
  - [x] **S4** — refonte écran `publication-shopify` (orienté handle, statut ⚠️, diff par paire, pré-push, publier, historique/rollback) *(commit `edac08a`, 37 tests front ; POC LocalDb publication supprimé)*
  - [ ] **S5** *(diff → post-boucle)* — webhook `products/update` → marque `remote_drift` sans poll
- [ ] **Appartenance TVA — projection par contexte de vente** ([`projection-sales-context.md`](./projection-sales-context.md)) :
  - [x] **C1** — registre `ACTIVE_SALES_CONTEXTS` + `CatalogueReader.tvaTags` (catégorie→régime→tag, ADR-13) *(commit `8a72f9e`, +3 tests)*
  - [x] **C2** — `collectionAddProductsV2` (`@lfd/shopify-admin`) + `ShopifyMembershipService` (résout tag→GID, **rapporte** l'absence, ne crée pas) *(commits `f363dfb`/`d8e9d6f`)*
  - [x] **C3** — push (live) range le produit dans sa collection `tva-*` ; échec non-bloquant ; **vérifié live** (baguette-artisane → tva-5-5, productCount 1) *(+5 tests)*
  - [ ] **C0 — Refonte data-driven du modèle contextes (PRÉ-REQUIS à C4/C5, à faire AVANT)** ([`projection-sales-context.md` §addendum](./projection-sales-context.md)) : `sales_context` (table registre) + `category_context_tva` (jointure) **remplacent** `Category.emporterTvaId`/`surPlaceTvaId` + `ACTIVE_SALES_CONTEXTS` const ; lectures en listes `[{contextKey, tag}]` ; migration des données emporter/sur-place existantes. Règle : **ajouter un contexte = une ligne, zéro code** ; une fois testé, le modèle est **gelé**. Cousin : idem pour `channelPreset` (boutiques `b1`/`b2` fixes).
  - [ ] **C0-bis — Handle publié = write-once (SEO)** : figer le handle au 1er push (binding/snapshot) ; **bloquer** le changement de `slug.fr` d'un produit publié (ou flux renommage+301) — sinon la réconciliation par handle orpheline l'ancien produit + casse le référencement ; réconciliation distingue **renommage** de **retrait+création** via `productId` ; `handleSuffix` d'un contexte figé **avant** son 1er push.
  - [ ] **C4** *(après C0)* — activer `surPlace` : projection multi-contexte (handles suffixés) + réconciliation par contexte
  - [ ] **C5** *(après C0)* — contexte `b2b` (TVA 20 %) = **une ligne de données** (grâce à C0)
- [ ] ~~**Webhooks Shopify** (`products/update`)~~ → absorbé par S5 ci-dessus
- [ ] `shopify_product_override` (titre, handle, tags saisis à la main) — à ne jamais écraser au re-push
- [ ] Modèle de **disponibilité** côté Shopify (capacité de production ≠ stock) — le vrai point dur
- [ ] Port de lecture `CatalogueReader` — les adaptateurs ne lisent **jamais** les tables du socle
- [ ] Adaptateur **B2B** (export fiches, pass-through GS1) — sans hiérarchie GDSN (ADR-14)

## Prochaine étape en cours

➡️ **Le questionnaire PI** (§ actions de cadrage) — c'est lui qui débloque le pricing,
l'anti-drift et la validité d'ADR-15. Côté code, la suite naturelle est `AddVariant`
(saisir les déclinaisons) puis la fiche réglementaire.
