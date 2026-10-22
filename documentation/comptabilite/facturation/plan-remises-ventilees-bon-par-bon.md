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

## 1. Ce qui change (révisé après `vitruve`, 2026-10-22)

- **R1 — tout ce qui se répartit se répartit sur son bon.** Pour chaque bon,
  dans l'ordre de `ventilateVat` (`packages/money/src/vat.ts`) :
  1. la remise de retrait, sur les seules lignes éligibles du bon ;
  2. le bon de fidélité, sur le **net que la remise a laissé**, pas sur le
     brut : sinon la répartition ne retombe pas sur les parts figées du bon, et
     une base par taux peut devenir négative ;
  3. le port qui suit la marchandise, sur les bases **brutes** du bon, comme à
     la passation. Il était en cause aussi : la facture le répartissait sur le
     cycle (`deliveryCharges`), avec le même défaut que les remises.
- **R2 — l'arrondi au centime se fait par bon, au plus fort reste.** Le bon ne
  garde que des fractions exactes et n'arrondit que la TVA ; la facture exige
  des parts en centimes (BT-92 par taux). Chaque montant d'un bon est donc
  découpé en parts entières par taux qui somment **exactement** à ce montant :
  partie entière de chaque part, puis les centimes restants aux plus fortes
  fractions, à égalité par taux croissant. La somme des BT-92 reste égale à
  BT-107 (BR-CO-11).
- **R3 — la facture additionne, taux par taux**, les parts entières de ses
  bons. Elle ne répartit plus rien elle-même : `invoiceVatBreakdown` reçoit des
  remises et des frais déjà découpés par taux. Elle garde une remise par motif
  et par taux (`company_discount`, `loyalty_voucher`), ce qu'exige BG-20.
- **R4 — la TVA par taux reste calculée une fois** sur la base nette du taux
  (BR-S-09). Seule la base change.
- **R5 — les bons non ventilés** (sans parts figées) passent par le même
  découpage : leur écart reste calculé comme aujourd'hui, sur les seuls bons
  concernés.

## 2. Ce que ça implique

- Le découpage se recalcule depuis les lignes figées du bon et ses montants
  figés (`discountCents`, `voucherDiscountCents`, `deliveryFeeCents`), jamais
  depuis la règle du jour. **À vérifier avant de bâtir** : que
  `voucherDiscountCents` figé soit bien le montant borné, comme la garde
  l'impose déjà à la remise de retrait.
- **Ce qui reste comme écart, et pourquoi.** Le bon arrondit
  `base exacte × taux` ; la facture arrondit `Σ parts entières × taux`. Il reste
  donc un écart de **pur arrondi**, borné à un demi-centime par bon et par taux.
  L'écart de composition, lui, disparaît. Le relevé de cycle
  (`cycle-statement.ts`), qui lit les parts figées des bons, garde le même
  écart d'arrondi avec la facture : il sera dit à l'écran.
- **L'API de `@lfd/money` change** (`InvoiceAllowance`, `InvoiceCharge`) :
  huit fichiers hors du paquet la touchent (dossier, facture émise,
  échantillons et specs Factur-X, e2e des factures). `pnpm test` à la racine
  est obligatoire.
- **Les commentaires qui deviendront faux** sont corrigés dans le même lot :
  la tête d'`invoice-dossier.ts` (« la TVA se recalcule sur l'agrégat ») et
  celle d'`invoice-vat.ts` (« les répartitions… l'appelant le décide »).
- **Les avoirs** (lot ZB, à venir) hériteront de la règle : un avoir sur un
  bon se découpe sur ce bon.
- **Une facture déjà émise ne change pas** : sa ventilation est relue telle
  quelle (`vat_breakdown`). La production n'en comptait aucune le matin du
  2026-10-22 (requête lancée par Hugo : 0 ligne).

## 3. Tests

- L'exemple du §0, chiffré : sans la répartition bon par bon, l'écart de
  composition apparaît ; avec, il disparaît.
- Le même exemple avec du port qui suit la marchandise sur des bons de
  compositions différentes.
- Une remise de retrait qui absorbe tout un taux, puis un bon de fidélité :
  aucune base négative.
- Pour tout cycle : `|TVA facture − Σ TVA des bons| ≤ ½ centime × bons × taux`,
  et Σ BT-92 = BT-107.
- Sans exclusion, bons de même composition : résultat identique à aujourd'hui.
- Les validations Factur-X (XSD, EN 16931, BR-FR) restent vertes.

## 4. Contredit par `vitruve` (2026-10-22)

Trois objections bloquantes, toutes reprises au §1 : le port était aussi en
cause (R1.3), le bon de fidélité porte sur le net de la remise (R1.2), et la
règle d'arrondi n'existait pas (R2). Les sérieuses sont reprises au §1 et au
§2 : le test borné, les bons non ventilés (R5), BR-CO-11, l'API de
`@lfd/money`, le relevé, les avoirs, les commentaires.
