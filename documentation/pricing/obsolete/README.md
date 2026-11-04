# Les docs de prix devenues obsolètes

> Relecture complète de `documentation/pricing/` contre le code, le
> 2026-11-04, au lendemain de la refonte du calcul du prix (lots L0 à L7,
> [`../centime-et-tva/le-prix-d-un-panier.md`](../centime-et-tva/le-prix-d-un-panier.md)).
> 42 docs relus en sept lots ; chaque verdict « obsolète » a été revérifié
> dans le code avant déplacement.

**Ce dossier est une archive.** Un doc rangé ici raconte un état du code qui
n'existe plus, ou un plan entièrement bâti dont le texte décrit encore
l'avant. Il reste lisible pour le raisonnement et les décisions qu'il porte —
le code en cite encore plusieurs pour ça — mais **rien de ce qu'il affirme sur
le code n'est à croire sans ouvrir le fichier**. Pour l'état réel, suivre le
lien « remplacé par ».

## 1. Les huit docs rangés ici

| Doc                                                                                    | Ce qu'il raconte                                                                                                                                                              | Pourquoi il est obsolète                                                                                                                                                                                                                                                               | Remplacé par                                                                                 |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`ecart-du-centime-particuliers.md`](ecart-du-centime-particuliers.md)                 | Le constat du 2026-10-09 : un particulier paie 2,39 € pour 1,90 € + 0,50 €, parce que le TTC se recalcule depuis le HT. « Rien n'est bâti », en attente du cabinet comptable. | Le correctif est bâti : une commande de particulier se compose en TTC (`exact_ht`, `domain/services/exact-order-composition.ts`, `packages/money/src/ttc-order.ts`). Ses sections « décision à retourner » et « piste non prête » décrivent un état disparu.                           | [`../centime-et-tva/le-prix-d-un-panier.md`](../centime-et-tva/le-prix-d-un-panier.md) § 8.1 |
| [`plan-centime-particuliers.md`](plan-centime-particuliers.md)                         | Le plan de la « voie B » : la commande d'un particulier construite en TTC, la TVA extraite par taux à la fin ; lots C1 à C3.                                                  | Bâti le 2026-10-27, puis absorbé par la refonte : son « ce qui change, endroit par endroit » (§ 6) cite des lignes et un assemblage remplacés par `priceBasket` appelé par l'agrégat. **Garde sa valeur** pour le droit (§ 2) et les décisions (§ 10, § 11) — le code le cite pour ça. | `le-prix-d-un-panier.md` § 2.2, § 8                                                          |
| [`recensement-montants-de-commande.md`](recensement-montants-de-commande.md)           | L'inventaire, au 2026-10-27, de qui lit et qui recalcule les montants d'une commande — la porte d'entrée du lot C2.                                                           | Inventaire daté, consommé par C2 et C3 ; il cite le fichier « voucher-total-effect » (supprimé) et des recalculs qui n'existent plus sous cette forme. Les lecteurs front sont désormais tenus par `lint:front-money-reads`.                                                           | `le-prix-d-un-panier.md` § 8                                                                 |
| [`plan-boutique-sur-api.md`](plan-boutique-sur-api.md)                                 | Le plan qui branche la boutique sur l'API et met fin aux deux sources de l'argent (livré le 2026-09-05).                                                                      | Son corps décrit le fichier « mock-shop » (supprimé), un `cart-total.ts` qui calcule (il ne porte plus que `CartLine`) et `POST /orders/quote` comme voie du prix, alors que la boutique passe par `POST /shop/quote`.                                                                 | [`plan-decompte-du-panier-ht.md`](plan-decompte-du-panier-ht.md)                             | Le plan du décompte HT du panier : sous-total, remise ou coursier, TVA par taux, TTC. | « Livré en entier », mais son raisonnement décrit le front qui calcule (`cart-total.ts`) et `Order.draft()` qui compose ; aujourd'hui le serveur sert les montants (`pretaxCents`) et `priceBasket` les compose. | `le-prix-d-un-panier.md` § 2.2, § 8 |
| [`architecture-conditionnements-pricing.md`](architecture-conditionnements-pricing.md) | Une conception des conditionnements du référentiel croisés avec le prix (fait produit contre décision commerciale).                                                           | Il porte lui-même un bandeau « PÉRIMÉ » depuis le 2026-09-09 : sa prémisse est fausse (`ProductVariant.priceCents` existe) et le service « product-commands » n'existe plus. Suivi comme R14 dans le registre.                                                                         | [`../ce-qui-reste-a-faire.md`](../ce-qui-reste-a-faire.md) (R14)                             |
| [`plan-familles-en-donnees.md`](plan-familles-en-donnees.md)                           | Le plan qui remplace les rayons écrits dans le code par des familles en données.                                                                                              | Bâti : `SHELF_BY_PIM_CATEGORY`, `shelfOfCategory`, `catalogCategorySchema`, `CATALOG_CATEGORY_ORDER` et le fichier « snapshot-limits » n'existent plus ; son inventaire du § 1 et son en-tête « doc-first » sont faux. La porte `lint:no-shelf-literals` tient la règle.               | `lint:no-shelf-literals` (CLAUDE.md, porte 39)                                               |
| [`plan-la-mercuriale-devient-un-objet.md`](plan-la-mercuriale-devient-un-objet.md)     | Le plan v3 qui fait de la mercuriale un agrégat au lieu de N règles dans `price_rules`.                                                                                       | Livré le 2026-09-08 (il le dit) ; son § 1 « aujourd'hui » décrit l'état d'avant. Garde le raisonnement des versions contredites.                                                                                                                                                       | [`../mercuriales/comprendre-une-mercuriale.md`](../mercuriales/comprendre-une-mercuriale.md) |

## 2. Gardé en place, réécrit

- [`../centime-et-tva/inventaire-c0-assemblages.md`](../centime-et-tva/inventaire-c0-assemblages.md)
  — l'inventaire décrivait les cinq assemblages de chiffrage du 2026-11-03,
  remplacés depuis. Réécrit le 2026-11-04 en **état des écarts É1 à É18**
  (fermés, voulus, ouverts), parce que le golden master et le code citent
  encore ces codes.

## 3. Partiellement périmés — le fond tient, des passages sont faux

Non déplacés : ils décrivent encore l'état réel pour l'essentiel. Les
passages faux, à corriger (décision de Hugo) :

| Doc                                                                                        | Ce qui est faux                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`../README.md`](../README.md)                                                             | N'indexe ni `le-prix-d-un-panier.md` ni `inventaire-c0-assemblages.md` ; l'export de grille « non commité » (il l'est) ; le pipeline du § 1 sans `PricingContext` ni `priceBasket`.                                              |
| [`../ce-qui-reste-a-faire.md`](../ce-qui-reste-a-faire.md)                                 | **R4** « `expectedTotalCents` n'existe nulle part » : livré (total vu, obligatoire) ; le § 0 compte 38 portes (il y en a 53) ; il se dit « seul registre » alors que `le-prix-d-un-panier.md` § 9 tient les restes du chiffrage. |
| [`../plan-export-grille-de-prix.md`](../plan-export-grille-de-prix.md)                     | « Non commité » (il l'est) ; le § 7 reste lisible comme décision, le § 8 fait foi.                                                                                                                                               |
| [`../saisie/plan-changer-l-unite-de-vente.md`](../saisie/plan-changer-l-unite-de-vente.md) | § 1 et § 3 décrivent le verrou d'avant ; seul le § 8 (bâti) est vrai.                                                                                                                                                            |
| [`../saisie/plan-prix-au-kilo.md`](../saisie/plan-prix-au-kilo.md)                         | Bandeau « doc-first » resté ; version de l'instantané 12 (elle est à 17).                                                                                                                                                        |
| [`../saisie/plan-prix-de-la-saisie.md`](../saisie/plan-prix-de-la-saisie.md)               | « P2b à bâtir » : bâti ; § 1 décrit l'avant.                                                                                                                                                                                     |
| [`../saisie/plan-report-apres-detachement.md`](../saisie/plan-report-apres-detachement.md) | § 0 « le report n'existe que pour la mercuriale » : faux ; bandeau « non commité ».                                                                                                                                              |
| [`../saisie/plan-retirer-le-rapport-pro.md`](../saisie/plan-retirer-le-rapport-pro.md)     | Bandeau « R3 non commité » : périmé.                                                                                                                                                                                             |

## 4. À jour

`boutique-et-panier/chemin-du-prix-public.md`, `mercuriales/comprendre-une-mercuriale.md` (réécrit le 2026-11-04),
`moteur/architecture-prix-vivant-prix-bloque.md` (note de conception, aucun
code — à ne pas confondre avec `VolumeCommitment`), `saisie/ecrans-de-tarification.md`,
`saisie/plan-carte-tarif.md`, `saisie/plan-prix-manquant-non-bloquant.md`,
`vente-au-poids.md`, `journal-de-remediation.md` (un journal qui ne se
réécrit pas, historique assumé), et les deux docs du 2026-11-04
(`centime-et-tva/le-prix-d-un-panier.md`, `moteur/plan-cache-du-catalogue.md`).

## 5. Ce que la relecture n'a pas vérifié

Les numéros de ligne cités un à un, les comptes de tests et de cas, les ~1 000
lignes du registre au-delà des entrées citées, et le détail ligne à ligne des
plans les plus longs (`architecture-resolution-de-prix.md`, 1 474 lignes, jugé
par sections).
