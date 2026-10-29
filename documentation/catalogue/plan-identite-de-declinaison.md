# Plan — l'identité d'une déclinaison

> 📐 **Doc-first**, écrit le 2026-10-29. Hugo, le même jour : « une déclinaison
> doit avoir une identité autonome, et le nom des déclinaisons à la création
> doit devenir le français », puis « on construit l'identité et on aura le vrai
> callout » — un callout sous la barre des déclinaisons qui dit : « le nom de
> cette déclinaison est à usage interne ; pour le nom de la boutique, modifier
> dans Identité de cette déclinaison ».

## 1. Ce qui existe (ouvert le 2026-10-29)

- `pim.product_variant.name` est un `jsonb` localisé (`{ fr: … }`), saisi à la
  création (`add-product-variant.ts`) et renommé par `rename-product-variant.ts`.
  C'est lui qui sert de **libellé d'onglet** au back-office (`variant-bar`).
- Le même nom est **le nom en boutique** : le fil porte `name = variant.name.fr`
  et `nameTranslations = variantNameTranslationsOf(variant.name, product.name)`
  (`apps/lfd-api/src/pim/channels/b2b-platform/products/translations.ts:53`),
  avec repli sur les traductions de la fiche quand la déclinaison porte, en
  français, exactement le nom de la fiche. Depuis `39a4c4258`, la vignette
  d'une déclinaison affiche ce nom seul.
- **La carte Identité appartient à la fiche** : sur une déclinaison autre que
  le défaut, elle est verrouillée (`lockedSections` de `product-form-store.ts`,
  qui verrouille `identite`, `communication`, `visuels`).
- Aucun écran ne saisit les traductions du nom d'une déclinaison.

## 2. Décisions

| #   | Question                     | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Deux noms                    | Une déclinaison porte un **libellé interne** (l'onglet, la saisie staff) et un **nom de boutique**, localisé et traduisible. Ce qui se lit en boutique, au devis, à la commande et sur la facture est le nom de boutique.                                                                                                                                                                                                                                                                                       |
| I2  | À la création                | Le nom saisi devient le libellé interne **et** le nom de boutique en français (Hugo). On les distingue ensuite.                                                                                                                                                                                                                                                                                                                                                                                                 |
| I3  | Le stockage                  | `name` (existant) reste le **nom de boutique** — c'est déjà lui qui part sur le fil, ses commandes et ses factures passées le citent. Nouvelle colonne `internal_label TEXT NULL` : `NULL` = le libellé interne est le français du nom de boutique.                                                                                                                                                                                                                                                             |
| I4  | Où se saisit le nom boutique | ⚠️ Révisé au § 3 : une carte à part, « Identité de la déclinaison ». Rédaction d'origine : dans la **carte Identité ouverte sur la déclinaison** : sur une déclinaison autre que le défaut, la carte n'est plus verrouillée en bloc — le champ « Nom en boutique » (et ses langues) est ouvert, les champs de la fiche (famille, nature…) restent verrouillés, avec la mention qui le dit. Sur le défaut, le nom en boutique de la déclinaison par défaut se saisit au même endroit, à côté du nom de la fiche. |
| I5  | Où se saisit le libellé      | Le crayon de la barre de déclinaisons (`rename-product-variant.ts`) renomme désormais le **libellé interne** seulement.                                                                                                                                                                                                                                                                                                                                                                                         |
| I6  | Le callout                   | Sous la barre : « Le nom de cette déclinaison est à usage interne. Le nom affiché en boutique se modifie dans Identité de cette déclinaison. »                                                                                                                                                                                                                                                                                                                                                                  |

## 3. Ce que la contradiction a changé (vitruve, 2026-10-29)

Trois BLOQUANTS, chacun tranché ici :

- **Le libellé suivait le nom de boutique** (`internal_label ?? name.fr`) : le
  changer renommait l'onglet. ➜ **Le libellé se fige au premier écart** : la
  commande du nom de boutique, quand `internal_label` est `NULL`, y écrit
  d'abord l'ANCIEN `name.fr`, dans la même transaction ; la création écrit les
  deux. Aucune ligne existante n'est réécrite par la migration : une déclinaison
  dont on n'a jamais changé le nom de boutique a, par construction, un libellé
  égal à son nom.
- **Le fait `variant.renamed`** racontait, jusqu'ici, un changement du NOM DE
  BOUTIQUE (c'est `name` qu'il porte). ➜ Il **garde ce sens** : c'est la
  commande du nom de boutique qui l'émet, même forme. Le crayon émet un fait
  NOUVEAU, `variant.internal_label_changed` (`{ before, after }` en texte), au
  contrat. L'historique ne ment pas.
- **« Tout enregistrer » écrit la fiche** et `lockedSections` verrouille une
  section entière. ➜ Le nom de boutique d'une déclinaison **n'entre pas dans la
  section `identite`** : il vit dans sa propre carte, « Identité de la
  déclinaison », dans la famille Identité, enregistrée seule et tout de suite
  (comme l'audience), ouverte sur TOUTE déclinaison, défaut compris. La carte
  Identité de la fiche ne change pas.

Les SÉRIEUX :

- **Les écrans du personnel** (atelier, colisage, bons de livraison, saisie de
  commande) lisent le snapshot `productNameSnapshot` de la ligne de commande,
  c'est-à-dire le nom de boutique ; la production attendue lit le nom courant.
  **C'est voulu** : le libellé interne ne sert qu'au référentiel (onglets,
  saisie du PIM) et ne part pas sur le fil. Changer le nom de boutique change
  ce que lit l'atelier pour les commandes suivantes — à dire dans la carte.
- **Le défaut** : sa vignette lit son nom de boutique, qui naît égal au nom de
  la fiche et hérite alors de ses traductions (`variantNameTranslationsOf`). La
  carte le dit : « tant que ce nom est celui de la fiche, il en prend les
  traductions ».
- **Le crayon** envoyait un `LocalizedText` complet : sa route prend désormais
  `{ label: string }`, et son appelant front suit.
- Révisions, matrice des allergènes et filiation lisent `name` : le nom de
  boutique, ce qui est juste ; un changement de libellé n'entre dans aucune
  révision, et c'est voulu.
- **Le callout part avec la carte**, dans le même lot : il ne dit vrai qu'une
  fois la carte livrée.

## 4. Le lot (un seul : backend + back-office)

> 🟦 **Bâti le 2026-10-29, pas encore commité.** Migration
> `20261029060000_le_libelle_interne_des_declinaisons` ; route du crayon
> `PUT …/variants/:variantId/name` sur `{ label }`, route du nom de boutique
> `PUT …/variants/:variantId/shop-name` ; carte `app-variant-identity-form`.
> Le nom de boutique enregistré est posé sur la déclinaison sans relire la
> fiche (une relecture effacerait les brouillons des autres cartes).

- Migration additive : `product_variant.internal_label TEXT NULL`.
- Domaine : `internalLabel` (lu `internal_label ?? name.fr`) ;
  `renameInternalLabel(text)` ; `renameForShop(LocalizedText)` qui fige le
  libellé au premier écart.
- Application : `rename-product-variant.ts` → libellé interne, fait
  `variant.internal_label_changed` ; nouvelle commande colocalisée
  `set-variant-shop-name.ts` → fait `variant.renamed` (inchangé).
- Back-office : onglets sur `internalLabel` ; carte « Identité de la
  déclinaison » (nom de boutique et ses langues) dans la famille Identité ;
  le callout I6 sous la barre ; crayon sur `{ label }`.
- Le fil, la boutique, le devis et la facture ne changent pas.

## 5. Ce qui n'est pas vérifié

- Le chemin exact de `productNameSnapshot` jusqu'à `place-order` (nom seul, ou
  fiche + déclinaison) — à suivre au bâti, sans changer son comportement.
