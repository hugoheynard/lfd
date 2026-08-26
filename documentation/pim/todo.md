# LFC PIM — TODO & décisions ouvertes

> Ce qui reste à trancher (produit/métier) et à faire (technique). Les décisions **fermées** migrent
> vers [`adr.md`](./adr.md).

## Décisions à trancher (produit / métier)

| #      | Sujet                                          | Enjeu                                                                                                                                                                                                                                                                                                                                                                                                                      | Statut         |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| D1     | **Nature exacte du B2B**                       | Revente pros (cafés, restaurants, collectivités) confirmée ? Paliers de volume + tarifs négociés par client → conditionne le modèle pricing (couche 02)                                                                                                                                                                                                                                                                    | 🔴 ouvert      |
| D2     | **Plan de production labo : auto ou manuel ?** | Consolidation auto de la demande multi-canal → plan, ou planification manuelle assistée ? Conditionne la couche 03                                                                                                                                                                                                                                                                                                         | 🔴 ouvert      |
| D3     | **Périmètre recettes / BOM**                   | Nomenclatures matières dans le scope v1 (calcul besoins farine…) ou plus tard ?                                                                                                                                                                                                                                                                                                                                            | 🔴 ouvert      |
| D4     | **Accès PI Electronique / Helios**             | API contractuelle **ou** export fichier (CSV/XML) ? **Principal inconnu technique** — conditionne l'adaptateur PI, le régime anti-drift, **et** la validité d'[ADR-15](./adr.md#adr-15--construire-un-pim-minimal-plutôt-quen-acheter-un). ➡️ **action : envoyer le questionnaire à PI** (8 questions, dont la n°4 — « peut-on déposer notre propre identifiant ? » — qui décide si le drift est accidentel ou structurel) | 🔴 ouvert      |
| D7     | **Résolution des prix**                        | Par **spécificité** (la règle la plus précise gagne) ou par **priorité numérotée explicite** ? La 1ʳᵉ est plus élégante, la 2ᵈᵉ plus prévisible pour un commercial qui débogue seul                                                                                                                                                                                                                                        | 🔴 ouvert      |
| D5     | **TVA**                                        | Taux paramétrables + distinction emporter / sur place — à confirmer avec le comptable                                                                                                                                                                                                                                                                                                                                      | 🟠 à confirmer |
| ~~D6~~ | ~~**Frontières d'agrégat**~~                   | **Clos le 2026-07-21** → `Product` racine (possède déclinaisons + fiches réglementaires), `Category`, `Collection`, `MediaAsset`                                                                                                                                                                                                                                                                                           | ✅ fermé       |

## Actions de cadrage (hors code — ce qui débloque le plus vite)

- [ ] **Questionnaire PI Helios** (8 questions) → lève D4, et avec lui le pricing, l'anti-drift et
      la validité d'ADR-15
- [ ] **Spike Shopify — 1 journée, 0 €** : boutique de développement + app personnalisée → pousser
      **un** produit à 2 déclinaisons avec un metafield allergène, le modifier dans l'admin, vérifier
      qu'un **webhook** revient. Passe de « je crois » à « je sais », et prouve le régime _surveillé_
      côté Shopify
- [ ] **Matrice de propriété** champ × système (`W` / `R` / `—`), **un seul `W` par ligne** — le
      document anti-drift de référence
- [ ] Vérifier le **coût du B2B natif Shopify** (offre Plus) — conditionne D1
- [ ] Trancher le modèle de **disponibilité côté Shopify** : capacité de production projetée en stock
      quotidien remis à zéro, **ou** créneaux de retrait (touche le paramétrage de la boutique)

## Décisions fermées récemment

- ✅ **Construire plutôt qu'acheter** → [ADR-15](./adr.md#adr-15--construire-un-pim-minimal-plutôt-quen-acheter-un) _(testable : révision à D4 et D1)_
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
- [ ] **Créer le tenant Auth0** + une _API_ (son Identifier = l'audience), puis renseigner
      `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` — sans ça, aucun jeton n'est validé
- [ ] Table `User` interne (notre id ↔ `sub` Auth0) — découple le domaine de l'IdP
- [ ] Câblage **front Angular** : `@auth0/auth0-angular` (PKCE) + interceptor qui porte le token
- [ ] Passerelle de configuration **côté front** — permettrait de retirer la dérogation
      `src/server.ts` du gate `no-direct-env`
- [ ] Lib `packages/shared-types` (DTOs partagés front/back, source de vérité TS)
- [ ] Lib UI `packages/ui` (design system, à venir)

### Domaine & données

- [x] **Langage ubiquitaire + commandes/faits + agrégats** (clôt D6) → [`00-langage-et-comportement.md`](./data-model/00-langage-et-comportement.md)
- [ ] Tables restantes du socle : `collection`, `product_collection` — `nutrition_declaration` est
      livrée (PK=FK)
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
- [ ] Le front redéclare `Category` / `Product` dans `pim/data/models.ts`, alors que
      `@lfd/pim-contracts` porte déjà les vues de fil. Le contrat existe ; c'est l'écran qui ne
      s'en sert pas encore pour ses propres modèles
- [ ] Verbes manquants : `AddVariant`, `ChangeVariantSku`. `MoveCategory` et `PublishProduct` sont
      exposés
- [ ] Format du SKU (motif + longueurs + `normalize`) dans `packages/shared-types` — partage
      **à la compilation**, pas un registre runtime
- [ ] Event store append-only : **différé** (ADR-11 révisé). Déclencheur = premier besoin d'as-of réel
- [x] Slice **allergènes** GS1→INCO (galop d'essai, domaine pur + tests)
- [x] **Vrais codes GS1** relevés sur T4078 et recoupés avec `ref.gs1.org/voc/AllergenTypeCode`
      (2026-08-25). Le drapeau `provisional` et le bandeau du formulaire ont disparu avec eux ;
      trois codes de l'ancien référentiel étaient faux, pas seulement incertains (cf. ledger)
- [x] **Fiche réglementaire** : table `nutrition_declaration` (PK=FK, optionnelle), validation dans
      le domaine (code inconnu, chevauchement, valeurs négatives), endpoint `/reference/allergens`
      (`scope=eu|world`), formulaire de création complet côté front
- [ ] 🟠 **Français résiduel dans le code backend**, contre la décision de langue (P1-P4) : les
      libellés de champ passés aux value-objects (`localizedText("nom", …)`). Le gate
      `code-language` ne les voit pas — il blanchit les littéraux de chaîne avant de compter, donc
      un libellé d'erreur lui échappe par construction. Relevé le 2026-08-25 ;
      `SalesChannelKey = "emporter" | "surPlace" | "b2b"` a disparu avec la traduction des clés
- [x] **Nommer les quatorze faits manquants** du journal du référentiel — fait le 2026-08-25.
      `lint:journal-tracked` affiche `27/27`, la dette déclarée est vide. Chaque geste a son fait :
      `product_category.{created,renamed,moved,archived,reordered,channels_changed}`,
      `product.{created,archived,restored}`,
      `point_of_sale.{created,updated,deleted,table_qr_generated,table_qr_removed}` — nommés
      `location.*` à l'époque, traduits en base par la fusion des emplacements dans les points de
      vente
- [ ] Garde `PublishProduct` : refuser la publication si une déclinaison active n'a pas de fiche
- [ ] Envelopper le domaine allergènes en provider Nest (ou extraire `libs/allergen-mapping`)
- [ ] Porter dans le repo les docs de cadrage restantes : pricing, disponibilité, `05-allergenes`
- [x] Couche **éditoriale** : `product_editorial` (PK=FK, optionnelle) + `media_asset` /
      `product_media` (liaison dédiée, pas de FK polymorphe) ; fiche en 3 cartes côté front
- [ ] **Envoi de fichiers** (R2/S3) — aujourd'hui on saisit une URL. Décision d'infra à prendre :
      fournisseur, nommage, dérivés de taille, ADR à écrire
- [ ] `product_certification` (labels : bio, IGP, AOP…) — `certifications` fait foi, pas de booléen

### Intégrations (adaptateurs `ChannelAdapter`)

- [ ] Contrat d'intégration **PI Helios** (bloqué par D4) → `helios_*_binding`, dont le
      `pos_family_code` et le **code-barres** (sortis du socle, ADR-13/14)
- [x] **Seam Shopify** : écran Réglages, projection pure + empreinte, bindings produit/déclinaison,
      bouton Pousser (ligne + global), pilote `dry-run` par défaut ([ADR-17](./adr.md#adr-17--secrets-dintégration-hors-base--pilote-de-canal-derrière-un-port))
- [ ] **Pilote Shopify réel** — à écrire **après le spike** (boutique de dev + jeton). Ne touche que
      `shopify-driver.ts`. Y compris : metafield allergènes, et l'`id` de déclinaison déposé côté
      Shopify comme clé de jointure
- [ ] **Réconciliation à trois voies** ([`publication-reconciliation-3way.md`](./publication-reconciliation-3way.md)) — 5 slices :
  - [x] **S1** — `ShopifyPushSnapshot` (payload rejouable) + `headSnapshotId` sur binding + écriture au push + `GET /history` + `POST /rollback` _(29 tests, commits `623d6fa`/`be718cb`)_
  - [x] **S2** — dry-run **réel sans effet de bord** (`pushPayloadSchema.dryRun`, `previewOne`) _(commit `4f28738`)_ ; bouton pré-push front reporté à S4
  - [x] **S3** — projection inverse THEIRS + `GET /reconciliation`(+`:handle`) + statuts (`local_ahead`/`remote_drift`/`conflict`/`to_remove`) _(dérive locale=empreinte pleine, distante=comparable ; commits `c01273f`/`841e967`, +20 tests)_
  - [x] **S4** — refonte écran `publication-shopify` (orienté handle, statut ⚠️, diff par paire, pré-push, publier, historique/rollback) _(commit `edac08a`, 37 tests front ; POC LocalDb publication supprimé)_
  - [ ] **S5** _(diff → post-boucle)_ — webhook `products/update` → marque `remote_drift` sans poll
- [ ] **Appartenance TVA — projection par contexte de vente** ([`contextes-et-points-de-vente.md`](./contextes-et-points-de-vente.md)) :
  - [x] **C1** — registre `ACTIVE_SALES_CONTEXTS` + `CatalogueReader.tvaTags` (catégorie→régime→tag, ADR-13) _(commit `8a72f9e`, +3 tests)_
  - [x] **C2** — `collectionAddProductsV2` (`@lfd/shopify-admin`) + `ShopifyMembershipService` (résout tag→GID, **rapporte** l'absence, ne crée pas) _(commits `f363dfb`/`d8e9d6f`)_
  - [x] **C3** — push (live) range le produit dans sa collection `tva-*` ; échec non-bloquant ; **vérifié live** (baguette-artisane → tva-5-5, productCount 1) _(+5 tests)_
  - [x] **C0-a — étendre** _(2026-08-24)_ : tables `sales_context` (registre, 3 lignes) + `category_context_tva` (jointure), reprise des taux déjà réglés. Colonnes conservées.
  - [x] **C0-b — basculer** _(2026-08-24)_ : agrégat, dépôt, lecteur, projections Shopify/B2B et les deux écrans lisent la jointure et itèrent le registre ; `GET /sales-contexts/active` (alors `/reference/sales-contexts`) ; `ACTIVE_SALES_CONTEXTS` supprimée. Les 3 colonnes restent ÉCRITES (`legacyTvaColumns`) pour le binaire précédent.
  - [ ] **C0-bis — Handle publié = write-once (SEO)** : figer le handle au 1er push (binding/snapshot) ; **bloquer** le changement de `slug.fr` d'un produit publié (ou flux renommage+301) — sinon la réconciliation par handle orpheline l'ancien produit + casse le référencement ; réconciliation distingue **renommage** de **retrait+création** via `productId` ; `handleSuffix` d'un contexte figé **avant** son 1er push.
  - [ ] **C4** — projection Shopify **multi-contexte** : handles suffixés (`handleSuffix`) et
        réconciliation par contexte. Le contexte « sur place » est actif et vendu depuis longtemps ;
        ce qui manque, c'est que Shopify en fasse un second produit. Aucun canal ne lit
        `handleSuffix` à ce jour, et l'unicité des suffixes projetés devra vivre là
- [ ] **Override local au produit — disponibilité + TVA** ([`contextes-et-points-de-vente.md`](./contextes-et-points-de-vente.md), 🟡 moitié faite) :
  - [x] **O0 (TVA)** _(2026-08-24)_ — `product_context_tva` + `effectiveTva` (résolveur pur, produit → famille → rien) appelé par les DEUX projections ; le port rend le taux **par produit**
  - [x] **O1 (TVA)** _(2026-08-24)_ — `PUT /catalogue/products/:id/tva`, `ProductView.tvaByContext`, journal `product.vat_changed` ; carte vide = retour à l'héritage
  - [x] **O2 (TVA)** _(2026-08-24)_ — « Redéfinir » par ligne dans l'encadré, panneau à un contexte, liseré + « Redéfini » ; part avec la section Tarif
  - [x] **O3** _(2026-08-24)_ — Shopify quitte la collection `tva-*` obsolète (S2), et le rapport le dit
  - [x] Compte d'usages : familles **et** fiches (un taux visé par une seule fiche paraissait libre)
  - [x] **Disponibilité** _(2026-08-24)_ — `product.channel_override` (`jsonb` nullable, `NULL` = hérite), `PUT /catalogue/products/:id/channels`, panneau réutilisant `ChannelMatrix` ; fermer un canal EFFACE les taux qu'on y avait posés, et les taux se jugent sur les canaux EFFECTIFS
  - [x] Vestige `Product.channelsOverride` : il vaut enfin ce que le serveur dit, au lieu de `null` en dur
  - [x] **La matrice est EFFECTIVE** _(2026-08-24)_ — B2B : fiche écartée du snapshot (`canal_ferme`), donc supprimée par l'ingestion au push suivant. Shopify : poussée en **brouillon** (hors vitrine, rien de détruit) ; la réconciliation pose la même question, sinon elle annoncerait une dérive éternelle
  - [ ] À trancher : le retrait B2B doit-il aussi retirer le _binding_ de canal, ou rester une conséquence de la matrice ? (aujourd'hui : conséquence — le binding reste, la fiche revient si on rouvre le canal)
- [ ] `shopify_product_override` (titre, handle, tags saisis à la main) — à ne jamais écraser au re-push
- [ ] Modèle de **disponibilité** côté Shopify (capacité de production ≠ stock) — le vrai point dur
- [ ] Port de lecture `CatalogueReader` — les adaptateurs ne lisent **jamais** les tables du socle
- [ ] Adaptateur **B2B** (export fiches, pass-through GS1) — sans hiérarchie GDSN (ADR-14)

## Prochaine étape en cours

➡️ **Le questionnaire PI** (§ actions de cadrage) — c'est lui qui débloque le pricing,
l'anti-drift et la validité d'ADR-15. Côté code, la suite naturelle est `AddVariant`
(saisir les déclinaisons) puis la fiche réglementaire.
