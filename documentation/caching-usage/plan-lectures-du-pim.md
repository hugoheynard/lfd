# Plan — le PIM du back-office lit moins

> 📐 **Plan, 2026-11-12.** Rien n'est bâti. Demande de Hugo : « je voulais
> optimiser pim », puis « écris le plan et enchaîne ». Audit du même jour
> (lecture du code, comptes estimés, pas mesurés) ; F = familles distinctes,
> d = profondeur d'une famille. Même modèle que
> [`plan-catalogue-du-back-office.md`](plan-catalogue-du-back-office.md), sur
> le [veilleur unique](plan-veilleur-unique.md).

## 1. En simple

Le PIM relit beaucoup pour peu : la liste des produits lit deux fois tout le
catalogue et relit tout après chaque geste, la fiche produit force la
relecture de référentiels déjà gardés, et un taux de TVA relit chaque famille.
Deux temps :

- **P1, les gains directs** : supprimer les doubles lectures, sans mécanisme
  nouveau ;
- **P2, le modèle du veilleur** : un numéro `pim`, des stores, un geste qui ne
  relit que ce qu'il touche.

## 2. Ce qui existe (audit du 2026-11-12)

| Écran ou route                                            | Aujourd'hui (estimé)                                                                                                                | Cause                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Liste des produits (`products-page.ts:285`, `:539-565`)   | ~34 + 4F à l'ouverture et après chaque geste                                                                                        | `catalogue/products` puis `products/compliance-warnings` relisent tout le catalogue ; familles lues trois fois                                         |
| Fiche produit (`product-form-store.ts:1390-1416`)         | ~31 + d à l'ouverture ; ~16 + d après une sauvegarde de la déclinaison par défaut ; `hydrate` complet après un geste de déclinaison | relecture complète ; `categoryChain` lit un ancêtre par requête (`prisma-product-lineage.reader.ts:89-106`)                                            |
| `vatPercents` (`prisma-catalogue-reader.ts:75-100`)       | 2 requêtes par famille, à chaque appel                                                                                              | relit chaque famille déjà chargée par l'appelant                                                                                                       |
| Référentiels de la fiche (`catalogue-api.ts:43-57`)       | ~7 à chaque ouverture                                                                                                               | force `reload()` des stores des familles et de la TVA ; calcule l'usage des taux, que la fiche n'affiche pas ; allergènes `eu` puis `world` sans cache |
| Matrice des allergènes (`allergen-matrix.store.ts:84-97`) | ~12 à chaque filtre                                                                                                                 | relit la matrice entière ; lit nutrition et TVA de contexte inutiles (`repository-allergen-matrix.source.ts:31-34`)                                    |
| Vue d'ensemble (`get-catalog-overview.ts:24-40`)          | ~13 + 2F par visite                                                                                                                 | construit l'ancre complète pour compter                                                                                                                |

Déjà bien : stores de session des familles, TVA, contextes de vente, réglages
d'allergènes, provenance ; lectures en lot (allergènes cités, illustrations).

## 3. P1 — les gains directs

Relu après `vitruve` (2026-11-12, § 6). Retirés de P1 : les filtres de la
matrice faits dans l'écran (la règle et les exports CSV et PDF divergeraient),
la fiche qui lit les stores sans relecture (un taux de TVA changé par un
collègue resterait invisible toute la session), la relecture de la seule
déclinaison (il faut une route neuve, et la relecture complète porte statut,
filiation et signature) : ils passent en P2, avec le numéro `pim`.

- **P1.1** `GET catalogue/products` rend aussi les alertes de conformité,
  calculées sur la même lecture ; la liste n'appelle plus
  `compliance-warnings`. La fiche (`product-form-store.ts:1883-1893`,
  après une publication) lit **les alertes de son seul produit** par
  `compliance-warnings?productId=…` au lieu de tout le catalogue.
- **P1.2** `vatPercents` reçoit les familles déjà chargées **seulement** pour
  la liste et les alertes, qui lisent `categories.listAll()` complet. Le port
  le dit : la liste passée contient **toutes** les familles, archivées
  comprises, et une famille absente lève toujours `CategoryNotFoundError`.
  L'activation (un produit) et l'ancre des révisions gardent leur chemin
  actuel. Un test de non-régression compare l'ancien et le nouveau calcul sur
  un catalogue avec famille archivée, dérogation produit et famille sans taux.
- **P1.3** Un store de session du référentiel des allergènes (`eu` et
  `world`), lu par la fiche et par la provenance : un référentiel
  réglementaire, qui ne change qu'avec une migration.
- **P1.4** La source de la matrice lit un type allégé (sans nutrition ni TVA
  de contexte) ; le filtrage reste au serveur, partagé avec les exports.
- **P1.5** Les ancêtres d'une famille en une requête (CTE récursive dans
  `catalogue/history/infrastructure/prisma-product-lineage.reader.ts`).
- **P1.6** La vue d'ensemble compte par une requête d'agrégat, avec la même
  règle qu'aujourd'hui : statuts vivants (`isLiveStatus`), déclinaisons
  archivées comptées dans les articles, refus sur un rattachement cassé.

## 4. P2 — le numéro `pim`, le contenu partagé et les stores

Tranché le 2026-11-12 avant le bâti (Hugo : « on enchaîne sur P2 »).

### 4.1 Le numéro `pim`

- **Un journal par déclencheurs, pas le journal des gestes.** Le journal des
  gestes du PIM (`pim/journal/pim-journal.ts`, vers `growth.activity_events`)
  est écrit par le code, geste par geste : une écriture qui l'oublie (semis,
  correctif, nouvelle route) passe inaperçue, et il vit hors du schéma `pim`.
  Un déclencheur ne s'oublie pas.
- **`pim.pim_change`**, en ajout seul dans le schéma `pim`, version =
  `max(id)` + `count(*)`, déclencheurs `FOR EACH STATEMENT` : une ligne par
  instruction qui touche au moins une ligne (§ 4.4).
- **Les tables** : toutes celles que lisent la liste des produits, les
  référentiels et le détail d'une fiche. Point de départ, à relire dans les
  lecteurs au bâti : `product`, `product_variant`, `product_editorial`,
  `product_media`, `product_packaging`, `product_readiness`,
  `product_context_tva`, `product_ingredient`, `variant_allergens`,
  `nutrition_declaration`, `nutrition_values`, `category`,
  `category_editorial`, `category_media`, `category_context_tva`, `tva_rate`,
  `sales_context`, `appellation`, `ingredient`, `ingredient_allergen`,
  `allergen_category`, `allergen_entry`, `order_time_limit`, `sku_registry`.
  Hors numéro, avec leur raison écrite : les révisions et la réémission (leur
  propre écran), les opérations, la liaison des canaux. Une constante
  `PIM_VERSIONED_TABLES` porte la liste ; un e2e vérifie un déclencheur par
  table de la liste, et un test compare la liste aux tables que lisent les
  adaptateurs de la liste, du détail et des référentiels.
- Élagueur à 7 jours dans `pim/` ; source globale `pim` reliée au registre
  par `appBootstrap`.
- **Droit** : le numéro s'ouvre à qui a `pim_catalog:read`, `pim_tax:read`
  ou `pim_settings:read` (il ne dit qu'« un changement a eu lieu »). Chaque
  contenu reste servi sous la garde de sa propre route.

### 4.2 Le contenu partagé

Par le port générique « contenu versionné » du catalogue, sous le numéro
`pim` : la liste des produits avec ses alertes, chaque référentiel (familles,
taux de TVA avec leur usage, contextes de vente, appellations, ingrédients,
allergènes), et le détail d'une fiche sous la clé (produit, numéro). Avant de
ranger un contenu, vérifier qu'il ne dépend pas de l'appelant (auteurs
résolus, champs sous droit) ; s'il en dépend, la part qui en dépend se lit à
part. Le nombre de fiches gardées est borné (500, les moins récemment
servies sortent), une version par fiche.

### 4.3 Les écrans

- `ProductListStore` : première ouverture seulement, numéro retenu, ligne
  relue après un geste (la copie garde son numéro : le veilleur relit tout,
  servi par l'objet), relecture en fond.
- Les stores des familles, de la TVA, des contextes de vente, de la
  provenance et des allergènes s'abonnent à `pim` et ne forcent plus de
  relecture ; la fiche les lit sans `reload()`.
- La fiche relit la seule déclinaison après une section de la déclinaison par
  défaut, par une route neuve, en gardant la péremption de la signature
  déduite au front ; après un geste de déclinaison, elle relit le détail (servi
  par l'objet) sans les référentiels.

### 4.4 Ce que `vitruve` a rendu sur P2 (2026-11-12), et ce qui en est fait

- BLOQUANT relire la seule déclinaison : les déclinaisons alignées héritent
  du défaut à la lecture → **retiré**. La fiche garde la relecture de son
  détail après une section ; pas de route neuve, et la péremption de la
  signature reste celle du serveur.
- Le filtre « vrai changement » ne retient rien sur une écriture Prisma
  (20 `@updatedAt`, `deleteMany` + `create` dans `save`) → **retiré** : le
  journal écrit une ligne par instruction qui touche une ligne, comme
  `company_change`. La promesse disparaît du § 4.1.
- Le détail d'une fiche : clé `pim-product:<id>`, **une ligne par fiche**
  dans l'objet (remplacée à chaque rangement), donc bornée par le nombre de
  fiches ; la borne de 500 disparaît. Le numéro est global : pendant une
  séance d'édition le détail se relit à chaque geste, et ne sert l'objet que
  pour une fiche rouverte sans écriture entre-temps. La mesure dira si un
  numéro par fiche vaut son prix.
- Le détail lit hors du schéma `pim` : la péremption de la signature
  (`growth.activity_events`) et le nom de celui qui l'a posée (annuaire
  `staff`). Accepté et écrit : un fait de contenu accompagne toujours une
  écriture dans `pim` (vérifié au bâti par un test), et un nom de staff
  renommé reste ancien dans l'objet jusqu'au prochain changement du PIM.
- La filiation : si le détail lit `catalog_revision_item`, la table entre au
  numéro (vérifié au bâti).
- Le droit du numéro s'ouvre aussi à `allergen_matrix:read`. Un store dont la
  route n'est pas permise à la personne (TVA sans `pim_tax`) garde sa
  relecture à l'ouverture, comme aujourd'hui.
- `pim` entre dans `GLOBAL_VERSION_SUBJECTS` (`@lfd/contracts` : `pnpm test`
  à la racine, par la CI) ; `pim.pim_change` entre à la couverture de la
  purge du scénario ; la source est reliée par
  `appBootstrap/day-version-sources.module.ts`.

## 5. Le bâti et la mesure

P1 bâti (`2ad3cb37e`). P2 : API (journal, source, contenu partagé, route
d'une déclinaison) puis écrans. Avant et après sur dev : requêtes Prisma
pour l'ouverture de la liste, d'une fiche, un geste, un filtre de matrice.

## 6. Ce que `vitruve` a rendu (2026-11-12)

- BLOQUANT la fiche lit `compliance-warnings` → route par produit (P1.1).
- BLOQUANT le filtre de la matrice et les exports → filtre gardé au serveur.
- SÉRIEUX `vatPercents` : pas d'héritage de taux ; l'ancre ne peut pas
  passer ses familles → P1.2 réservé à la liste et aux alertes, contrat écrit,
  test de non-régression.
- SÉRIEUX TVA périmée dans un store de session → reporté en P2.
- SÉRIEUX la relecture complète de la fiche porte statut et signature →
  reportée en P2.
- SÉRIEUX P2 non tranché → P2 révisé avant son bâti.
