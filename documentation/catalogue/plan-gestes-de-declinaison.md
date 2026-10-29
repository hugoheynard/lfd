# Plan — archiver une déclinaison, et en faire un produit

> 📐 **Doc-first**, écrit le 2026-10-29. Demande de Hugo : « supprimer une
> déclinaison et transformer une déclinaison en produit (avec un nouvel id) ».
> Ses trois réponses du même jour font foi (§ 2).

## 1. Ce qui existe (ouvert le 2026-10-29)

- Une déclinaison est une entité de l'agrégat `Product`
  (`apps/lfd-api/src/pim/catalogue/product/domain/entities/variant.ts`) ; ses
  gestes ont chacun leur fichier dans `application/` (`add-product-variant.ts`,
  `rename-product-variant.ts`, `align-variant-on-default.ts`…). Aucun ne
  retire ni ne détache une déclinaison.
- **`product_variant.is_discontinued` existe déjà**, `false` à la naissance,
  et **rien ne le pose** : seul `product-compliance.ts` le lit (« toutes les
  déclinaisons arrêtées » bloque l'activation). C'est la colonne de l'archivage :
  aucune migration n'est nécessaire pour le geste 1.
- Les références vivent au registre `pim.sku_registry` : une référence n'est
  jamais réattribuée.
- Le commerce ne connaît une déclinaison que par son SKU et ses faits
  (`catalog_items`). Les tarifs négociés et mercuriales la visent par SKU.

## 2. Décisions (Hugo, 2026-10-29)

| #   | Question                          | Décision                                                                                                                                                                                                                            |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Supprimer une déclinaison         | **Archivée, hors vente** : `is_discontinued = true`. Elle quitte la fiche et la boutique, reste en base ; commandes, factures et tarifs qui la citent gardent leur sens ; sa référence n'est jamais réattribuée.                    |
| D2  | La référence d'un produit détaché | **Nouvelle référence** : nouveau produit (nouvel id, nouveau SKU produit) et nouvel article `<SKU>-1` ; l'ancienne déclinaison est archivée (D1). Les tarifs posés sur l'ancien SKU ne suivent pas : ils sont listés.               |
| D3  | Ce que copie le nouveau produit   | **Tout ce que la déclinaison voyait** : ses réglages propres et ce qu'elle héritait du défaut (tarif, allergènes, nutrition, minimum), plus la famille, la TVA, l'audience, les textes et visuels de la fiche. Il naît **inactif**. |

Règles qui en découlent :

- **On n'archive pas la déclinaison par défaut** tant qu'il en reste d'autres
  vivantes : il faut d'abord en désigner une autre par défaut (refus nommé). On
  n'archive pas la dernière déclinaison vivante : c'est la fiche qu'on archive
  (`archive-product.ts`).
- **On ne détache pas la déclinaison par défaut** (même raison), ni une
  déclinaison archivée.
- Une déclinaison qui **suivait** le défaut (tarif, allergènes, nutrition,
  minimum) naît dans le nouveau produit avec les valeurs **résolues**, en propre :
  elle est le défaut de son produit.
- **Un rang ne se réattribue pas** (question de Hugo, 2026-10-29) : la
  déclinaison archivée reste dans l'agrégat, filtrée seulement à l'affichage et
  aux lectures vendables. Son rang reste donc pris (`Product.nextVariantPosition`
  prend le plus haut rang + 1), et la déclinaison créée après le départ de `-2`
  s'appelle `-3` — pas un second `-2`, ni `-2-2` (le suffixe que `proposeSku`
  ajoute sur une collision au registre).
- Une déclinaison sœur qui suivait la déclinaison détachée n'existe pas : on ne
  suit que le défaut.

## 3. Les lots

### G1 — archiver (backend + back-office)

- `Product.discontinueVariant(variantId)` refuse le défaut et la dernière
  vivante ; commande colocalisée `discontinue-product-variant.ts`, route
  `POST /pim/catalogue/products/:id/variants/:variantId/discontinue`, fait de
  journal `product.variant_discontinued`, émission au catalogue : le commerce
  retire l'article de la vente.
- Le détail de fiche ne sert plus les déclinaisons archivées dans la barre ; la
  barre de déclinaisons propose « Archiver la déclinaison » (dans une
  `fold-danger-zone`, avec confirmation).

### G2 — détacher en produit (backend + back-office)

- Commande `detach-product-variant.ts` : charge la fiche d'origine, construit le
  nouveau `Product` par sa factory à partir de la vue résolue de la
  déclinaison (D3), lui attribue un nouvel id et un nouveau SKU par le même
  générateur que la création, l'enregistre, puis archive la déclinaison d'origine
  (G1) — **dans une seule unité de travail**. Journal des deux côtés
  (`product.created_from_variant` sur le nouveau, `product.variant_detached` sur
  l'origine).
- Rendre au geste la liste des tarifs négociés et mercuriales qui visaient
  l'ancien SKU (lecture par le canal du commerce, si elle existe ; sinon, dire
  qu'elle manque et ne rien inventer).
- Back-office : « Faire de cette déclinaison un produit » dans la même zone ;
  après succès, ouvrir la nouvelle fiche.

### G3 — l'origine, et désarchiver (Hugo, 2026-10-29)

- **L'origine se trace des deux côtés** : `pim.product.origin_variant_id` sur le
  produit né d'un détachement, `pim.product_variant.detached_to_product_id` sur
  la déclinaison d'origine — migration additive, FK `Restrict`, posés dans la
  même unité de travail que G2. Chaque fiche montre l'autre, avec un lien.
- **Désarchiver** : `Product.restoreVariant`, route `…/restore`, fait
  `product.variant_restored`. La déclinaison reprend son rang et sa référence.
  **Refusée si elle a été détachée** : elle vit déjà comme un autre produit, et
  la remettre en vente vendrait deux fois le même article — le refus nomme ce
  produit. C'est la colonne `detached_to_product_id` qui distingue « archivée »
  de « devenue un produit ».
- Back-office : les déclinaisons archivées se listent à part, chacune avec
  « Désarchiver » (`fold-inline-confirm`), ou « Devenue le produit Z » et son lien.

## 4. Ce qui n'est pas vérifié

- Que le commerce retire bien de la vente un article dont le fait dit
  « arrêté » — le chemin exact est à lire au bâti.
- Qu'une lecture des tarifs par SKU existe côté commerce pour D2.
