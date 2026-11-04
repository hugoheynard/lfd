# L6 — un écran lit ses montants, il ne les calcule pas

> 📝 Plan du 2026-11-04, doc-first : rien n'est bâti. Lot L6 du
> [plan du prix d'un panier](plan-un-seul-assemblage.md). Hugo, ce jour :
> « pour mes commandes, elles sont passées donc ça devrait être une lecture »,
> et le reliquat d'un bon « calculé par le serveur ». Touche l'affichage de
> l'argent : contredit par `vitruve` avant de bâtir.

## 1. L'état (ouvert et vérifié le 2026-11-04)

Le « Total HT » d'un pro au compte suit une seule règle,
`orderPretaxCents` (`packages/money/src/order-pretax.ts`, commits `b4442c1d8`,
`7198fd0ec`). Mais cinq de ses huit lecteurs l'**appliquent côté écran** :

| Écran                             | Fichier                                                                  | Vue lue             |
| --------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| Fiche, pied de montants           | `packages/b2b-ui/src/order/order-pricing.ts` (`pretaxTail`)              | `OrderTotalsSource` |
| Fiche, en-tête                    | `packages/b2b-ui/src/order/order-detail/order-detail.ts`                 | `CustomerOrderView` |
| Bon en texte                      | `packages/b2b-ui/src/order/order-sheet-text.ts`                          | `SheetMoney`        |
| Panier, confirmation, suggestions | `apps/lfc-ecommerce-frontend/src/app/client/cart/shown-cart-total.ts`    | `ShopQuoteView`     |
| Mes commandes                     | `apps/lfc-ecommerce-frontend/src/app/client/mes-commandes/order-rows.ts` | `CustomerOrderView` |

`OrderTotalsSource` a deux sources : la commande passée, et l'estimation de la
saisie (`estimateTotalsSource`, `AdminOrderEstimateAmountsView`). Les trois
autres lecteurs (bon PDF, e-mail, récapitulatif) sont au serveur.

Le reliquat d'un bon de fidélité plus gros que le panier est soustrait à
l'écran : `cart-summary.ts`, `voucherRemainder` (valeur du bon choisi − part
imputée du devis).

## 2. La règle

**Un écran ne calcule aucun montant.** Il lit un champ que le serveur a
calculé, avec la fonction qui facture. Une commande passée est une lecture ;
un devis aussi.

## 3. Les champs ajoutés (additifs, aucune migration)

- `pretaxCents` — le « Total HT » du bon, par `orderPretaxCents` sur les
  colonnes figées — dans :
  - `OrderView` (`prisma-order.reader.ts`) et `CustomerOrderView`
    (`toCustomerOrder`, liste explicite des champs) ;
  - `SheetMoney`, **obligatoire**, et ses DEUX producteurs : le bon de
    commande (`order-sheet.ts`, `moneyOf`) porte le HT commandé ; le bon de
    livraison (`delivery-notes/domain/services/delivery-note-sheet.ts`,
    `moneyOf`) porte le HT **livré**, par la même règle sur ses propres
    montants (vitruve, BLOQUANT) ;
  - `ShopQuoteView` (`shop-quote-view.ts`) ;
  - `AdminOrderEstimateAmountsView` (`estimate-order-for-customer.handler.ts`).
- `voucherRemainderCents` dans `MyShopQuoteView` seulement (un bon n'existe
  que dans un espace personnel, `quote-my-shop-cart.handler.ts`) : ce qui
  restera du bon après imputation, `null` sans bon. Le serveur connaît sa
  valeur (`OrderVoucher.valueCents`, lu dans `shop-quote-view.ts`).

Pour toute commande, ancienne comprise : les colonnes HT sont figées depuis
toujours. Par document :

| Document                                      | HT porté                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| fiche, Mes commandes, bon de commande, e-mail | commandé (colonnes de la commande ; aujourd'hui déjà, `order-pricing.ts` ne lit aucun `billable_*`, vérifié par vitruve le 2026-11-04) |
| bon de livraison                              | livré (ses montants)                                                                                                                   |
| facture du mois                               | facturé (inchangée)                                                                                                                    |

## 4. Les écrans

Les cinq lecteurs lisent `pretaxCents` ; `cart-summary.ts` lit
`voucherRemainderCents`. `orderPretaxCents` sort de `@lfd/b2b-ui` et des fronts.

## 5. La porte — `lint:front-money-reads`

Sur `apps/*-frontend/src` et `packages/b2b-ui/src`, hors specs. Deux étages,
parce que la règle du §2 est plus large que ce lot (vitruve, SÉRIEUX) :

- **Refusé sans exception** : l'import de `orderPretaxCents` /
  `netArticlesCents`, et `totalCents -` / `- …vatCents` / `vat.reduce(` —
  la forme exacte de ce que L6 retire.
- **Dette comptée, en baisse seulement** (comme `lint:controller-buses`) :
  toute somme `reduce(` dont l'accumulateur ajoute un champ `…Cents`. Les
  fichiers qui en portent aujourd'hui sont inscrits par nom ; un fichier
  hors liste qui en gagne une échoue, un fichier nettoyé resté inscrit
  échoue. Recensés par vitruve le 2026-11-04 : `order-sheet-ticket-text.ts`,
  `order-ticket.ts`, `invoices-page.ts`, `billing-periods.ts`,
  `facturation-page.ts`, `detached-unpaid-card.ts`, `dossier-orders.ts`,
  `batch-lines.ts`, `revision-entry.ts`. La liste exacte est celle que la
  porte trouve au premier passage.

Les tests de la porte : un fichier fautif par motif, et un fichier admis.

## 6. Ce que ce plan ne fait pas

- **Vider la dette du §5** : les totaux de factures, de périodes, de dossier,
  de lot de prélèvement et de révision. Ce sont des sommes de plusieurs
  documents, chacune un champ serveur à créer ; un lot par écran, plus tard.

- Les conversions millicentimes → centimes de prix unitaires
  (`unitPriceCents`).
