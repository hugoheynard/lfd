# Plan — les remises de la facture, ventilées bon par bon

> **Doc-first, 2026-10-22.** Rien n'est bâti. Touche **l'argent** (TVA par taux
> de la facture, Factur-X) : `vitruve` avant Hugo. Suite de V7 du plan
> [`plan-remise-retrait-par-clientele-et-exclusions.md`](../../livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md).

## 0. Le problème (ouvert le 2026-10-22)

Chaque bon ventile ses remises par taux au moment de sa passation
(`computeOrderTotals`, `b2b/orders/domain/services/vat.ts`) : la remise de
retrait sur ses seules lignes éligibles, puis le bon de fidélité sur le net.
Ses parts de TVA sont figées (`vatShares`).

La facture, elle, ne relit pas ces parts. Elle additionne les remises de tous
les bons du cycle (`invoice-dossier.ts`, `buildInvoice`) et les répartit **une
fois** sur les marchandises du cycle (`invoiceVatBreakdown`,
`packages/money/src/invoice-vat.ts`) — sur les lignes éligibles du cycle pour
la remise de retrait depuis le lot A (`3101cb5b5`).

Une répartition faite sur le cycle ne retombe pas sur la somme des
répartitions faites bon par bon dès que les bons n'ont pas la même
composition de taux. Exemple : un bon de pain seul (5,5 %) avec une remise de
5 €, et un bon de boissons seules (20 %) sans remise, éligibles toutes deux.
Bon par bon, les 5 € portent sur le 5,5 %. Sur le cycle, une partie glisse sur
le 20 %. La TVA de la facture diffère alors de celle des bons, et l'écart tombe
dans la rubrique « arrondi » du dossier, alors que ce n'en est pas.

Ce n'est pas né avec le lot A : le bon de fidélité, et la remise de retrait
avant lui, se répartissaient déjà sur le cycle. Le lot A l'a rendu plus
visible, parce qu'une exclusion sépare les taux.

## 1. Ce qui change

- **R1** — chaque remise d'un bon se répartit par taux **sur ce bon**, avec
  son assiette (lignes éligibles pour la remise de retrait, toutes pour le bon
  de fidélité), un arrondi par taux et par bon, à la même règle que
  `computeOrderTotals`.
- **R2** — la facture **additionne**, taux par taux, ces parts déjà
  réparties. Elle ne reventile plus rien. Elle garde une remise par motif et
  par taux (`company_discount`, `loyalty_voucher`), ce qu'exige BG-20 et que
  le Factur-X écrit déjà (BT-92 par taux).
- **R3** — `invoiceVatBreakdown` reçoit des remises **déjà réparties par
  taux**, en plus de celles qu'il répartit lui-même. Les frais (port qui suit
  la marchandise) gardent leur mécanisme actuel : ils ne sont pas en cause.
- **R4** — la TVA par taux reste calculée **une fois** sur la base nette du
  taux (BR-S-09) : seule la base change, pas la façon de taxer.

## 2. Ce que ça implique

- La répartition par bon se recalcule depuis les lignes figées du bon et ses
  montants figés (`discountCents`, `voucherDiscountCents`) — pas depuis la
  règle du jour.
- L'écart « arrondi » du dossier ne contient plus que de l'arrondi.
- Une facture déjà émise ne change pas : elle est figée. Les factures émises
  avant ce lot gardent leur ventilation ; la production n'en comptait aucune
  le 2026-10-22.

## 3. Tests

- L'exemple du §0, chiffré : la TVA de la facture égale la somme des bons.
- Sans exclusion et avec des bons de même composition : résultat identique à
  aujourd'hui.
- Les validations Factur-X (XSD, EN 16931, BR-FR) restent vertes.
