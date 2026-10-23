# Plan — la remise de retrait, une par clientèle, avec ses exclusions

> **Doc-first, 2026-10-22.** Rien n'est bâti. Touche **l'argent** (remise,
> ventilation de TVA, facture) et porte une **migration** : `vitruve` avant
> Hugo. Suite de
> [`plan-remise-et-livraison-par-clientele.md`](plan-remise-et-livraison-par-clientele.md)
> (D2 : une remise, deux cases).

## 0. La demande (Hugo, 2026-10-22)

La remise d'un point de retrait accordée aux pros doit **exclure certaines
catégories d'articles**. Décisions du jour :

- on exclut par **catégorie et par produit** ;
- on **sépare** la remise pro et la remise particulier : chaque clientèle a
  sa propre réduction et ses propres exclusions ;
- la remise **reste au point de retrait**, et ne passe pas par les
  promotions (§1).

## 1. Pourquoi pas les promotions (écarté le 2026-10-22)

Vérifié dans `prisma/schema/public/pricing.prisma` et
`b2b/orders/application/services/cart-adjustments.service.ts` le 2026-10-22 :

- une promotion est une `PriceRule` : elle fixe un **prix unitaire**, sur
  **une** portée (`global` | `category` | `product` | `variant`), sans
  exclusion. Une contrainte d'exclusion GiST refuse deux règles de même
  spécificité qui se chevauchent ;
- la remise de retrait est un **ajustement de panier**, calculé sur le
  sous-total une fois les prix posés (`discountCentsOf(discount, subtotalCents)`),
  et figé sur la commande (`discount_cents`, `discount_adjustment`).

Mettre le mode d'acheminement dans les promotions ferait dépendre le prix
affiché d'un choix fait après l'affichage. Il faudrait aussi ajouter
l'exclusion au moteur de prix, et la règle « tout le catalogue » chevaucherait
les vraies promotions. Enfin, la remise serait fondue dans le prix des lignes
au lieu d'être une remise lisible sur le bon et la facture.

## 2. Ce qui existe (ouvert le 2026-10-22)

- `PickupAddress` (`settings.prisma`) : `discount_mode`, `discount_value`,
  `discount_for_b2b`, `discount_for_b2c`. **Une** réduction, deux cases.
- `PickupDiscount` (`pickup-addresses/domain/pickup-discount.ts`) refuse une
  réduction qui ne vise personne. `pickupDiscountFor(point, audience)`
  (`@lfd/contracts`, `pickup.ts`) rend la réduction ou `null`.
- `ventilateVat` (`packages/money/src/vat.ts`) retranche la remise **au
  prorata de toutes les lignes**, taux par taux. La facture fait de même sur
  le cycle (`invoice-dossier.ts`, allocation `company_discount`).
- La catégorie d'un article est connue du commerce par sa projection du
  catalogue (`catalog.prisma`, `category_id`). Elle n'est **pas** figée sur
  `OrderLine`.

## 3. Le point qui change le calcul : la TVA

Exclure une catégorie ne change pas seulement le montant de la remise. Ça
change aussi **sur quels taux** elle porte. Exemple : une remise de 10 % sur
le pain à 5,5 %, avec la boisson à 20 % exclue. Ventilée au prorata de tout le
panier comme aujourd'hui, une partie de la remise serait retranchée de la base
à 20 % : la TVA serait **fausse**, sur le bon comme sur la facture.

D'où les deux règles :

- **R1** — l'assiette de la remise est le sous-total des **seules lignes
  éligibles**, et sa ventilation se fait **au prorata de ces seules lignes**.
- **R2** — l'éligibilité est **figée sur la ligne** à la passation
  (`order_lines.pickup_discount_eligible`). Une catégorie déplacée ou une
  exclusion changée demain ne doit pas réécrire la TVA d'un bon d'hier. La
  facture lit ce drapeau, jamais la règle du jour.

Le bon de fidélité (`voucherDiscountCents`) garde son assiette actuelle, qui
est toutes les lignes. Les deux remises doivent donc être ventilées sur deux
assiettes différentes. Aujourd'hui, `ventilateVat` (`packages/money/src/vat.ts`)
ne prend qu'une remise : c'est `computeOrderTotals`
(`b2b/orders/domain/services/vat.ts:141`) qui additionne les deux avant de
l'appeler (corrigé après `vitruve`, 2026-10-22).

## 4. Les lots

### A — serveur

1. **Migration additive** :
   - `pickup_addresses` reçoit la réduction particulier dans ses propres
     colonnes (`b2c_discount_mode`, `b2c_discount_value`), et la réduction
     actuelle devient celle des pros. **Reprise** : un point dont la case B2C
     était cochée recopie sa réduction côté particuliers ; un point dont la
     case B2B était décochée perd sa réduction pro. Les cases restent en base,
     sans lecteur (colonne morte, `CLAUDE.md` §0).
   - une table `pickup_discount_exclusions` (point, clientèle, `category` |
     `product`, identifiant opaque) ;
   - `order_lines.pickup_discount_eligible boolean not null default true` :
     les bons passés étaient tous éligibles, et le défaut dit la vérité.
2. **Domaine** : `PickupDiscount` devient deux remises, une par clientèle,
   chacune `{ adjustment, excludedCategoryIds, excludedProductIds }`. Il est
   refusé d'exclure sans réduction.
3. **Calcul** : une fonction pure `eligibleSubtotal(lines, exclusions)`, puis
   `discountCentsOf` sur ce sous-total. Le devis de la boutique et la passation
   la partagent (`shop-cart-quoting.service.ts`, `cart-adjustments.service.ts`).
4. **`ventilateVat`** prend une remise d'assiette restreinte, en plus de la
   remise sur toutes les lignes. Son prorata ne porte que sur les lignes
   éligibles. Les tests verrouillent l'exemple du §3.
5. **Facture** : l'allocation `company_discount` se ventile au prorata des
   lignes éligibles du cycle. `invoice-order-consistency` et le relevé
   restent d'accord avec elle. Le Factur-X garde une remise par taux (BT-92),
   qui est désormais juste.

### ~~B — back-office~~ — bâti le 2026-10-23 (`f92df2f49`)

> Décrit au présent dans [`sites.md`](../../sites/sites.md), « Paramétrage du
> retrait ». Le pont provisoire vers l'ancienne carte est retiré. Non bâti : le
> nombre d'articles que chaque règle couvre aujourd'hui (seconde moitié de V9).

La page du point de retrait montre deux cartes, « Pros » et « Particuliers ».
Chacune a sa réduction et ses exclusions, choisies parmi les catégories et les
produits du catalogue publié, en sélection multiple.

### C — boutique et documents

- Le panier dit « remise retrait sur X € éligibles » quand une ligne est
  exclue.
- Le bon porte la même mention.

> **Partie serveur bâtie le 2026-10-23 (non commitée à l'écriture).** Le front
> de la boutique reste à faire. Contrat (`@lfd/contracts`), tout facultatif :
> `PickupDiscountBaseView { eligibleHtCents, eligibleTtcCents, excludedSkus }`,
> servi en `pickupDiscountBase` sur `ShopQuoteView` (devis), `OrderView` /
> `CustomerOrderView` (commande relue) et `SheetMoney` (bon) — **absent** sans
> remise ou sans ligne exclue. Une ligne exclue porte `pickupDiscountEligible:
false` (`OrderLineView`, `CustomerOrderLineView`, `ClientSheetLine`), absent
> sinon. La remise est hors taxe : `eligibleHtCents` est son assiette ;
> `eligibleTtcCents` est la somme des TTC de ligne, `null` sans TTC scellé
> (commande pro). Un seul calcul, `pickupDiscountBaseOf`
> (`apps/lfd-api/src/b2b/orders/domain/services/pickup-discount-base.ts`), sur
> `eligibleSubtotalCents` du lot A ; la commande et le bon le refont sur les
> lignes **figées**. Le bon écrit « Remise retrait sur X € éligibles » (HT au
> pro, TTC au public), un astérisque sur la ligne exclue, et « * Non concerné
> par la remise retrait. » au pied ; la tasse du bon public de la planche est
> exclue pour le montrer.

## 5. Décisions (Hugo, 2026-10-22)

- **Q1 — oui, on peut réinclure un produit** dans une catégorie exclue (« c'est
  sûr qu'on va avoir le cas »). Une règle par **produit** l'emporte sur la
  règle de sa **catégorie**, dans les deux sens : un produit peut être exclu
  dans une catégorie remisée, ou réinclus dans une catégorie exclue. La table
  du §4.A.1 porte donc un sens (`exclude` | `include`), et une réinclusion
  n'est admise que sur un produit.
  **Tenu par l'agrégat depuis le 2026-10-23** (Hugo) : `PickupDiscount.of`
  refuse une règle de famille à contre-sens du mode (famille incluse en
  `all_except`, exclue en `only`) par `PickupDiscountCategoryReinclusionError`
  (400, `pickup.discount.category_against_scope`). La relecture en base
  (`PickupDiscount.restore`) ne la refuse pas : une ligne d'avant ne bloque
  pas le chargement du site, l'écran la signale toujours, et la prochaine
  écriture de la remise la refusera.
- **Deux modes de portée** (Hugo, 2026-10-22 : « tout sauf… ou ça plus
  ça ») : chaque remise est `all_except` (toutes les lignes sauf celles
  listées) ou `only` (aucune ligne sauf celles listées). Dans les deux, une
  règle sur un produit l'emporte sur celle de sa catégorie. La reprise pose
  `all_except` sans règle, c'est-à-dire le comportement d'aujourd'hui. Une
  remise `only` sans aucune inclusion ne porte sur rien : l'agrégat la refuse.
- **Q2 — oui** : une règle sur un produit couvre toutes ses variantes.
- **Catégorie figée sur la commande** : chaque ligne porte, en snapshot, le
  produit et la catégorie de l'article au moment de la passation
  (`order_lines.product_id`, `order_lines.category_id`), en plus du drapeau
  d'éligibilité. On sait alors pourquoi une ligne était exclue, et le port de
  V4 ne sert qu'à la passation et aux avenants.
- **V5 — sans objet** : une remise de retrait n'existe que sur une commande
  retirée, donc sans frais de livraison. La garde de l'agrégat le vérifie.
- **V6 — oui** : le contrat servi à la boutique change de forme dans le même
  déploiement.
- **Q3 — oui** : la reprise recopie la réduction actuelle côté particuliers
  quand la case B2C est cochée (sans rien effacer, V8).

## 6. Contredit par `vitruve` (2026-10-22) — le plan n'est pas bâtissable en l'état

Les objections, avec la réponse prévue. Une réponse marquée **à trancher**
attend Hugo.

### Bloquant

- **V1 — la garde de l'agrégat.** `ensureDiscountMatches`
  (`order-amount-guards.ts:83-91`) recalcule la remise sur le sous-total
  **entier** et refuserait toute commande dont une ligne est exclue. Prévu :
  l'agrégat recalcule l'assiette lui-même à partir du drapeau de ses lignes,
  au lieu de la recevoir de l'extérieur. Même chose pour `computeOrderTotals`
  (`order.ts:140`).
- **V2 — les trois endroits qui ventilent.** `computeOrderTotals` (`vat.ts:141`),
  `voucher-total-effect.ts:23-27` et `shop-cart-quoting.service.ts:156`
  fusionnent ou recalculent la remise. Prévu : `ventilateVat` reçoit une liste
  de remises, chacune avec son assiette, et les trois appelants basculent
  ensemble.
- **V3 — la facture.** Elle ne passe pas par `ventilateVat` : elle passe par
  `invoiceVatBreakdown` (`packages/money/src/invoice-vat.ts:98-101`), qui
  alloue chaque remise sur toutes les marchandises. Prévu : les remises
  reçoivent des `prorataBases`, comme les `charges` en ont déjà.
  L'éligibilité entre aussi dans `FrozenInvoiceOrder` et dans la clé de fusion
  de `aggregateInvoiceLines` (`invoice-lines.ts:58`), sinon une ligne éligible
  et une ligne exclue du même SKU fusionnent.
- **V4 — la catégorie à la passation.** `OrderLine` ne porte que le `sku`. Il
  existe deux `categoryId` : `CatalogItem` (`catalog.prisma:146`, avec clé
  étrangère) et `CatalogEntry` (`catalog.prisma:575`, sans clé). Prévu : un
  port déclaré par `orders` (« la catégorie et le produit de ces SKU »),
  implémenté par `catalog` sur `CatalogItem`, le catalogue servi. Le modèle
  reste lu par son propriétaire (`lint:prisma-model-ownership`).

### Sérieux

- **V5 — le port qui suit la marchandise.** Il est aujourd'hui réparti sur la
  base **brute** (`vat.ts:155-165`), avec une justification qui ne tient plus
  quand la remise est restreinte. **À trancher** : brut (proposé, c'est ce que
  le client a acheté) ou net. Le commentaire sera corrigé dans les deux cas.
- **V6 — le contrat servi.** Basculent avec le lot A :
  `prisma-site.repository.ts:33-35` et `:75-78`, `site-row.ts:27`, et le
  contrat `pickupDiscountFor` (`packages/contracts/src/pickup.ts:33-41`) que la
  boutique lit (`pickup-discount.ts:47-56`, `bestPickupDiscount`). C'est une
  casse de contrat, admise en pré-release (`CLAUDE.md` §0) : **à trancher**.
  L'étiquette « −10 % » d'un point de retrait doit aussi dire « sur les
  articles éligibles ».
- **V7 — l'écart au niveau du cycle.** Une remise répartie sur les lignes
  éligibles du cycle ne retombe pas sur la somme des répartitions faites bon
  par bon, dès que les bons ont des compositions de taux différentes. Ce
  n'est pas de l'arrondi. Prévu : la facture somme les parts **figées** de
  chaque bon (`vatShares`) plutôt que de reventiler le cycle, et un bon sans
  parts figées tombe dans l'écart « non ventilé » qui existe déjà.
- **V8 — la reprise est destructive.** Prévu : la migration n'efface **rien**.
  La réduction pro se lit dans les colonnes actuelles **et** la case B2B ; la
  réduction particulier est copiée dans les colonnes `b2c_*`. Les cases
  restent en base, et revenir en arrière reste possible. « Pas d'exclusion
  sans réduction » est tenu par l'agrégat, pas en base.
- **V9 — les exclusions orphelines.** Une catégorie retirée, ou un produit qui
  change de famille, change ce que l'exclusion couvre sans que personne le
  voie. Prévu : l'écran montre en rouge une exclusion qui ne pointe plus sur
  rien, et le nombre d'articles que chaque exclusion couvre aujourd'hui.
- **V10 — les avenants.** Une ligne ajoutée par avenant reçoit son drapeau par
  le même port que la passation, et la remise est recalculée par l'agrégat
  (V1).

### Mineur

- Le devis et **trois** passations (client, boutique, équipe) passent par
  `forPickup` (`cart-adjustments.service.ts:112-113`).
- L'assiette des points de fidélité (`order-earning.ts:78`) lit un montant, et
  reste juste.
- Le drapeau est porté par la ligne, donc par SKU (`@@unique([orderId, sku])`).
  C'est cohérent avec Q2.

### Non vérifié par `vitruve`

Le générateur Factur-X, le relevé de cycle, les spécimens et `order-sheet.ts`,
le propriétaire de `catalog_items` pour la porte, et le §1.
