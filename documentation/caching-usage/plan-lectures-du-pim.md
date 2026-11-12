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

## 4. P2 — le numéro `pim` et les stores (à réviser avant le bâti)

À trancher avant de bâtir (`vitruve`, point 6) : les tables exactes parmi
les 37 du schéma `pim` et la porte qui les tient, pourquoi le journal des
gestes du PIM (`pim/journal/pim-journal.ts`) ne suffit pas, le droit exact.
Y entrent aussi les trois points retirés de P1.

- Journal en ajout seul **dans le schéma `pim`** (`pim.pim_change`), version
  `max(id)` + `count(*)`, déclencheurs `FOR EACH STATEMENT` qui n'écrivent que
  sur un vrai changement, sur les tables lues par la liste et le référentiel
  (à relire au bâti) ; élagueur dans `pim/` ; source globale sous le droit de
  lecture du PIM.
- `ProductListStore` : chargé à la première ouverture, ligne remplacée après
  un geste, numéro retenu (l'écho du propre geste ne relit rien), relu quand
  le numéro diffère.
- Les stores de référentiel existants s'abonnent au numéro au lieu de vivre
  toute la session sans jamais voir le geste d'un collègue.

## 5. Le bâti et la mesure

P1 d'abord (API P1.1, P1.2, P1.4 à P1.6 ; écran P1.1 et P1.3), puis P2
après sa révision. Avant et après sur dev : requêtes Prisma
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
