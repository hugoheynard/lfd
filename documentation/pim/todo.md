# LFC PIM — TODO & décisions ouvertes

> Ce qui reste à trancher (produit/métier) et à faire (technique). Les décisions **fermées** migrent
> vers [`adr.md`](./adr.md).

> 🔴 **Nettoyé le 2026-09-22 de son travail Shopify.** Le canal est sorti du dépôt
> le 2026-09-21 : sept actions ouvertes qui le visaient ont été retirées (spike,
> coût du B2B natif, disponibilité, pilote réel, réconciliation S5, projection
> multi-contexte, `shopify_product_override`). Les lignes `[x]` restent — elles
> disent ce qui a été fait, et le journal ne se réécrit pas.
>
> ⚠️ **Un seul besoin a survécu à son canal** et est signalé sur place : personne
> ne fabrique de seconde fiche pour le contexte « sur place », qui est pourtant
> vendu. C'est une question du modèle.

## Décisions à trancher (produit / métier)

| #      | Sujet                                          | Enjeu                                                                                                                                                                                                                                                                                                                                                                                  | Statut         |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| D1     | **Nature exacte du B2B**                       | Revente pros (cafés, restaurants, collectivités) confirmée ? Paliers de volume + tarifs négociés par client → conditionne le modèle pricing (couche 02)                                                                                                                                                                                                                                | 🔴 ouvert      |
| D2     | **Plan de production labo : auto ou manuel ?** | Consolidation auto de la demande multi-canal → plan, ou planification manuelle assistée ? Conditionne la couche 03                                                                                                                                                                                                                                                                     | 🔴 ouvert      |
| D3     | **Périmètre recettes / BOM**                   | Nomenclatures matières dans le scope v1 (calcul besoins farine…) ou plus tard ?                                                                                                                                                                                                                                                                                                        | 🔴 ouvert      |
| ~~D4~~ | ~~**Accès PI Electronique / Helios**~~         | **Clos le 2026-09-22** — Hugo : « PI disparaît de notre vie ». La caisse n'est plus un canal du référentiel. ⚠️ Ce qui dépendait de D4 tombe avec elle : le questionnaire, le régime anti-drift, les tables `helios_*_binding` (qui n'ont jamais existé) et le déclencheur de révision d'ADR-15. Le code n'en portait **aucune ligne** — l'intégration était entièrement documentaire. | ✅ fermé       |
| D7     | **Résolution des prix**                        | Par **spécificité** (la règle la plus précise gagne) ou par **priorité numérotée explicite** ? La 1ʳᵉ est plus élégante, la 2ᵈᵉ plus prévisible pour un commercial qui débogue seul                                                                                                                                                                                                    | 🔴 ouvert      |
| D5     | **TVA**                                        | Taux paramétrables + distinction emporter / sur place — à confirmer avec le comptable                                                                                                                                                                                                                                                                                                  | 🟠 à confirmer |
| ~~D6~~ | ~~**Frontières d'agrégat**~~                   | **Clos le 2026-07-21** → `Product` racine (possède déclinaisons + fiches réglementaires), `Category`, `Collection`, `MediaAsset`                                                                                                                                                                                                                                                       | ✅ fermé       |

## Actions de cadrage (hors code — ce qui débloque le plus vite)

- ~~**Matrice de propriété** champ × système~~ — **caduque le 2026-09-22** : elle
  n'existait que pour arbitrer qui écrit quoi entre le référentiel, la caisse et
  la boutique. Les deux autres systèmes sont partis (Shopify le 2026-09-21, PI le
  2026-09-22). ⚠️ Un seul écrivain ne se dispute rien — mais la matrice redeviendra
  nécessaire au **deuxième** système, quel qu'il soit.

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
- [x] **Créer le tenant Auth0** + une _API_ (son Identifier = l'audience), puis renseigner _(fait — `apps/lfd-api/.env` porte un domaine et une audience réels)_
      `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` — sans ça, aucun jeton n'est validé
- [x] Table `User` interne (notre id ↔ `sub` Auth0) — découple le domaine de l'IdP _(fait — `prisma/schema/public/account.prisma`, `model User`)_
- [x] Câblage **front Angular** : `@auth0/auth0-angular` (PKCE) + interceptor qui porte le token _(fait — `auth/auth.providers.ts`, `provideAuth0` + interceptor)_
- [ ] Passerelle de configuration **côté front** — permettrait de retirer la dérogation
      src/server.ts du gate `no-direct-env`
- ~~Lib `packages/shared-types`~~ — **caduc** : le dépôt range par CONTEXTE (`@lfd/contracts`, `@lfd/pim-contracts`), et `CLAUDE.md` §1 interdit nommément un `shared-types` global. ⚠️ Le besoin derrière — partager le format du SKU — reste ouvert, voir la ligne dédiée.
- ~~Lib UI `packages/ui`~~ — **caduc** : le système de composants du dépôt est **fold-ng**, et aucun `packages/ui` n'a jamais existé.
- [x] **Le nom d'une famille se saisit en FR/EN/IT** _(2026-08-27)_ — le contrat le
      portait déjà (`LocalizedText`, colonnes `Json`), l'écran n'en montrait que le
      français : `CategorySettingsDraft.nameFr` a été remplacé par le texte complet,
      le tableau se lit dans une langue au choix, et les lignes qui **retombent** sur
      le français sont marquées — sans quoi basculer le sélecteur ne changerait rien à
      l'œil et passerait pour une panne
- [x] **La famille a sa PAGE** _(c-0, 2026-08-27)_ — le side-panel est supprimé,
      remplacé par `categories/:id` et `categories/nouveau` sur le gabarit de la
      fiche produit : une carte par section, enregistrement **par section**, rail
      droit « Résumé ». Le panneau tenait à trois réglages ; il ne tient plus dès
      qu'une famille porte des descriptions et des visuels
  - [x] `SectionState` ne connaît plus la fiche produit — jeton `SECTION_EDITING`,
        quatre membres, et le typage fin par générique
  - [x] **c-1 — descriptions** _(2026-08-27)_ — `category_editorial` (résumé,
        description, titre et description SEO), tous localisés ; `PUT :id/editorial`
        et section « Communication ». QUATRE champs et non les sept d'une fiche :
        récit, accord et marque parlent d'un produit, pas du rayon
  - [x] **c-2 — médias** _(2026-08-27)_ — `category_media` joignant la
        bibliothèque `MediaAsset` **existante** ; `PUT :id/media` en remplacement,
        et la galerie de la fiche produit extraite en `media-gallery/` plutôt que
        dupliquée. Le ramassage d'orphelins connaît désormais les DEUX porteurs —
        sans quoi il aurait supprimé de R2 des images qu'une famille affiche
  - [ ] `category-form-store.ts` est à 315 lignes (limite ≲300). La coupe
        naturelle est un channels-draft.ts, symétrique de `editorial-draft` et
        `media-draft` : canaux, contextes réglables et taux à enregistrer sont un
        seul sujet
- [ ] Converger `ProductFormStore` sur `shared/lang-switch/localized-field.ts` — le
      même motif de saisie traduisible y est écrit à la main, en plus ancien. Deux
      copies d'une règle (« vider une traduction l'EFFACE, la source ne s'efface
      pas ») finissent par ne plus dire la même chose de « traduit »

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
- [x] Garde `PublishProduct` : refuser la publication si une déclinaison active n'a pas de fiche _(fait — `product.ts` `publish()` lève `ProductNotPublishableError`)_
- [x] Envelopper le domaine allergènes en provider Nest (ou extraire `libs/allergen-mapping`) _(fait — `pim/allergens/allergens.module.ts`)_
- [ ] Porter dans le repo les docs de cadrage restantes : pricing, disponibilité, `05-allergenes`
- [x] Couche **éditoriale** : `product_editorial` (PK=FK, optionnelle) + `media_asset` /
      `product_media` (liaison dédiée, pas de FK polymorphe) ; fiche en 3 cartes côté front
- [x] **Envoi de fichiers** (R2/S3) — aujourd'hui on saisit une URL. Décision d'infra à prendre : _(fait — `media.controller.ts` + `upload-product-image.ts`, dépôt R2 adressé par hachage)_
      fournisseur, nommage, dérivés de taille, ADR à écrire
- [ ] `product_certification` (labels : bio, IGP, AOP…) — `certifications` fait foi, pas de booléen

### Intégrations (adaptateurs `ChannelAdapter`)

- ~~Contrat d'intégration **PI Helios**~~ — **caduc le 2026-09-22** (Hugo : « PI disparaît de notre vie »). Aucun fichier `helios*` n'a jamais existé dans `apps/lfd-api/src` : l'intégration était entièrement documentaire.
  `pos_family_code` et le **code-barres** (sortis du socle, ADR-13/14)
- [x] **Seam Shopify** : écran Réglages, projection pure + empreinte, bindings produit/déclinaison,
      bouton Pousser (ligne + global), pilote `dry-run` par défaut ([ADR-17](./adr.md#adr-17--secrets-dintégration-hors-base--pilote-de-canal-derrière-un-port))
- ~~**Réconciliation à trois voies**~~ — **caduque** : S1 à S4 ont été livrées
  (snapshots, dry-run réel, projection inverse, écran), S5 (webhook `products/update`)
  ne le sera jamais. Le canal est sorti le 2026-09-21 et le code avec lui.
- [ ] **Appartenance TVA — projection par contexte de vente** ([`contextes-et-points-de-vente.md`](./contextes-et-points-de-vente.md)) :
  - [x] **C1** — registre `ACTIVE_SALES_CONTEXTS` + `CatalogueReader.tvaTags` (catégorie→régime→tag, ADR-13) _(commit `8a72f9e`, +3 tests)_
  - [x] **C2** — `collectionAddProductsV2` (`@lfd/shopify-admin`) + `ShopifyMembershipService` (résout tag→GID, **rapporte** l'absence, ne crée pas) _(commits `f363dfb`/`d8e9d6f`)_
  - [x] **C3** — push (live) range le produit dans sa collection `tva-*` ; échec non-bloquant ; **vérifié live** (baguette-artisane → tva-5-5, productCount 1) _(+5 tests)_
  - [x] **C0-a — étendre** _(2026-08-24)_ : tables `sales_context` (registre, 3 lignes) + `category_context_tva` (jointure), reprise des taux déjà réglés. Colonnes conservées.
  - [x] **C0-b — basculer** _(2026-08-24)_ : agrégat, dépôt, lecteur, projections Shopify/B2B et les deux écrans lisent la jointure et itèrent le registre ; `GET /sales-contexts/active` (alors `/reference/sales-contexts`) ; `ACTIVE_SALES_CONTEXTS` supprimée. Les 3 colonnes restent ÉCRITES (`legacyTvaColumns`) pour le binaire précédent.
  - ~~**C0-bis — Handle publié = write-once (SEO)**~~ — **caduc** : tout le mécanisme reposait sur le push et la réconciliation par handle, sortis avec le canal le 2026-09-21. ⚠️ La protection des **URL indexées** redeviendra une question le jour d'un canal public — mais pas sous cette forme.
  - ~~**C4** — projection Shopify multi-contexte~~ — **caduque** (canal sorti le
    2026-09-21). ⚠️ Le besoin, lui, reste entier : le contexte « sur place » est
    actif et vendu, et **aucun canal n'en fait une seconde fiche**. C'est une
    question du modèle, pas de Shopify — elle se repose telle quelle au prochain
    canal public.
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
- [x] Port de lecture `CatalogueReader` — les adaptateurs ne lisent **jamais** les tables du socle _(fait — `catalogue/shared/domain/ports/catalogue-reader.ts`)_
- [x] Adaptateur **B2B** (export fiches, pass-through GS1) — sans hiérarchie GDSN (ADR-14) _(fait — `channels/b2b-platform/products/feed-projection.service.ts`)_

## Révisions du catalogue — la suite

Les trois tranches sont livrées (cf.
[`flux-catalogue-et-versionnement.md`](./flux-catalogue-et-versionnement.md)).
Ce qui reste :

- [ ] **Filtrer un diff par nature de changement** — ajout / suppression /
      modification / publication. Trois des quatre existent déjà dans la réponse
      (`added`, `removed`, `changed`) : le filtre est alors une facette d'écran,
      sans un aller-retour de plus.
      La quatrième demande une décision. Une **publication** est aujourd'hui une
      `modification` comme une autre — le champ `status` passe de `draft` à
      `published` dans le payload de l'article. La sortir en catégorie propre
      veut dire qu'un article qui change de statut ET de prix apparaît dans
      DEUX facettes, ou qu'on choisit laquelle l'emporte. Trancher avant
      d'écrire : un article qui disparaît d'un filtre parce qu'il a aussi changé
      de prix est le genre d'absence qu'on ne remarque pas.
- [ ] **Purger les contenus orphelins** — un `catalog_content` que plus aucune
      révision ne référence ne disparaît pas (clé étrangère `RESTRICT`, à
      dessein). Sans ancre supprimable aujourd'hui, la question ne se pose pas ;
      elle se posera au premier archivage de vieilles révisions.

## Provenance — la suite

Les deux référentiels et la section de fiche sont livrés (cf.
[`ingredients-et-appellations.md`](./ingredients-et-appellations.md)).
Ce qui reste :

- [x] **Déclarer les allergènes SUR l'ingrédient**, et les remonter _(fait — `IngredientAllergen` + `set-ingredient-allergens.ts` ; les trois questions sont tranchées DANS le schéma : recopié et non hérité)_
      automatiquement dans la fiche qui le cite. Le beurre porte `AM` une fois,
      et toute fiche qui cite du beurre l'hérite — au lieu de le re-cocher à
      chaque produit, avec l'oubli qui va avec.

      ⚠️ **Trois questions à trancher avant d'écrire**, et aucune n'est
                                          technique :

                                          1. **Hérité ou recopié ?** Hérité, corriger le beurre corrige cent fiches
                                             — y compris celles qu'on n'a pas relues. Recopié, chaque fiche garde ce
                                             qu'elle a affirmé le jour où elle l'a affirmé. Une déclaration
                                             d'allergène ENGAGE : la première est plus juste, la seconde plus
                                             défendable six mois plus tard.
                                          2. **Que devient la saisie manuelle ?** Aujourd'hui les allergènes se
                                             cochent sur la DÉCLINAISON (`NutritionDeclaration`), qui distingue trois
                                             états — `null` (rien déclaré), `[]` (déclaré sans allergène), une liste.
                                             Un héritage doit dire ce qu'il fait de ces trois-là, et notamment si le
                                             `[]` d'une fiche l'emporte sur le `AM` de son beurre.
                                          3. **Le grain ne correspond pas.** L'ingrédient est porté par le PRODUIT,
                                             l'allergène par la DÉCLINAISON — c'est elle qui est mise sur le marché.
                                             Deux déclinaisons d'un même produit peuvent avoir des recettes
                                             différentes ; faire descendre l'ingrédient sur chacune est un choix, pas
                                             une évidence.

                                          Tant que ce n'est pas tranché, la section Ingrédients reste éditoriale et
                                          n'affirme rien de réglementaire — cf. l'avertissement en tête de sa note.

## Paramétrage produit — deux écrans posés, vides

Le menu du référentiel sépare désormais **Paramétrage produit** (le vocabulaire
dans lequel une fiche se remplit) de **Général** (ce qui se règle trois fois par
an). Deux entrées y ont été posées avec une page vide : l'entrée dit où la chose
ira, la page dit qu'elle n'y est pas encore.

- [x] **Allergènes → `/pim/allergenes`.** Déménager le **référentiel** GS1, en _(fait — `allergens-page.ts` 215 lignes, panneaux entrée et catégorie)_
      dur aujourd'hui dans `allergens/allergen-reference.ts` et servi par
      `GET /pim/reference/allergens`.

      ⚠️ **Ne pas déménager la déclaration.** Ce qu'une fiche déclare se coche
                                  sur la **déclinaison** (`NutritionDeclaration`), et doit y rester : c'est
                                  elle qui est mise sur le marché, et une déclaration réglementaire se prend
                                  en regardant le produit, pas une table de réglages. Ce qui monte ici,
                                  c'est la LISTE ; ce qui reste en bas, c'est l'AFFIRMATION.

                                  À trancher avant d'écrire : un référentiel modifiable veut dire qu'on peut
                                  retirer un code que des fiches déclarent déjà. Même question que les
                                  appellations, avec un enjeu plus lourd — cf. le `RESTRICT` qui les
                                  protège.

- [ ] **Conditionnements → `/pim/conditionnements`.** La table existe
      (`product_packaging` : référence propre, quantité, poids brut, prix,
      canaux) ; **rien ne la saisit**, ni ici ni sur la fiche.

      Ce qui vient ici est le **vocabulaire** — les types de conditionnement et
                                  ce qu'ils nomment. Combien d'unités dans le carton d'un produit donné
                                  reste sur la fiche : c'est une propriété de ce produit.

                                  Le point qui justifie l'écran : un conditionnement porte sa **propre
                                  référence**. Le professionnel commande « le carton de 24 », pas « 24 fois
                                  l'article » — c'est ce qui en fait autre chose qu'une quantité.

## Prochaine étape en cours

➡️ **Le questionnaire PI** (§ actions de cadrage) — c'est lui qui débloque le pricing,
l'anti-drift et la validité d'ADR-15. Côté code, la suite naturelle est `AddVariant`
(saisir les déclinaisons) puis la fiche réglementaire.
