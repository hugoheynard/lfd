# Plan E4a — le bon de livraison porte ses totaux

> ✅ **Bâti le 2026-10-24** (migration `20261024230000_le_bon_de_livraison_porte_ses_totaux`).
> Vérifié au bâti : aucun écrivain des totaux de commande après la remise ;
> l'exception du § 4 tient. Corrigé : l'annulation ne remet pas `totalCents`
> à 0 (`prisma-order-cancellation.repository.ts` l. 76 est un `where`).
> Non recopiés, à trancher en E4b : `discountAdjustment`,
> `deliveryFeeAdjustment`. Le contrôle sort dans le compte rendu de
> `POST admin/delivery-notes/reconcile` (pas de route à part).

> **Doc-first, 2026-10-24.** Premier temps du lot E4 de
> [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md)
> (« la facture lit les BL »), coupé en deux par l'assistant (décision du
> 2026-10-24, Hugo : « tu décides seul ») : **E4a** donne au BL tout ce que la
> facture lit ; **E4b** fera lire la facture sur le BL. Touche **l'argent**
> et porte une **migration** : `vitruve` avant le bâti. **Rien n'est bâti.**
> Une ombre, comme E1 et E2 : personne ne lit encore ces totaux.

## 0. Ce qui existe (ouvert le 2026-10-24)

- **La facture lit la commande par une seule couture** :
  `FROZEN_INVOICE_ORDER_SELECT` et `toFrozenInvoiceOrder`
  (`b2b/accounting/infrastructure/frozen-invoice-order.mapper.ts`), utilisés
  par quatre lecteurs : `prisma-monthly-invoicing.reader.ts`,
  `prisma-invoice-dossier.reader.ts`, `prisma-card-invoicing.reader.ts`,
  `prisma-collection-candidates.reader.ts`. Le JSDoc le dit : « écrite une
  fois : deux lectures du même bon qui divergeraient factureraient deux
  montants ».
- **Ce que la couture lit** (`FrozenInvoiceOrder`) : numéro, création, jour
  demandé ; par ligne `sku`, nom, prix millicents, taux, quantité,
  `lineTotalCents`, `pickupDiscountEligible` ; et sur la commande
  `discountCents`, `voucherDiscountCents`, `deliveryFeeCents`,
  `deliveryVatMode`, `lateFeeCents`, `lateFeeAdjustment` (dont le taux de TVA
  de la surtaxe), `vatShares`, `vatCents`, `totalCents`
  (`prisma/schema/public/orders.prisma`, l. 197-277 ; `pickupDiscountEligible`
  l. 587 sur la ligne).
- **Le BL (E1, E2)** recopie SKU, nom, prix, taux, quantité, totaux HT et TTC
  de ligne — **pas** `pickupDiscountEligible` — et aucun total d'en-tête
  (`prisma/schema/public/delivery-notes.prisma`).
- **L'arrondi au plus fort reste** existe : `splitCents`
  (`packages/money/src/order-vat-split.ts`), égalité au taux le plus bas.

## 1. Ce que fait E4a

**Le BL porte exactement ce que `FrozenInvoiceOrder` lit**, pour que E4b
n'ait qu'à changer la source de la couture :

- **Ligne** : `pickup_discount_eligible` (recopié).
- **En-tête** : `subtotal_cents`, `discount_cents`, `voucher_discount_cents`,
  `delivery_fee_cents`, `delivery_vat_mode`, `late_fee_cents`,
  `late_fee_adjustment` (jsonb), `vat_shares` (jsonb), `vat_cents`,
  `total_cents`.

### 1.1 La règle d'argent — un BL complet reprend la commande

Tant qu'aucun BL partiel n'existe (il naîtra en E6), **chaque BL vivant est
complet** : ses lignes sont celles de la commande. Sa règle est alors une
**recopie**, pas un calcul : chaque total d'en-tête est celui de la commande.
Le centime ne peut pas bouger, par construction.

La **répartition** entre plusieurs BL (§ 7 du plan-cadre : montants fixes au
premier BL, remise en pourcentage au prorata du livré par `splitCents`, TVA
ventilée par BL) est écrite et testée en E4a comme une **fonction pure du
domaine** (`allocateOrderTerms(order, notes)`), mais **appelée** seulement en
E6. Sa propriété est testée dès maintenant : pour toute découpe d'une commande
en BL, **Σ des BL = la commande**, au centime, sur chaque total.

_Décidé par l'assistant, 2026-10-24_ : recopier plutôt qu'appeler
l'allocation sur un seul BL. Raison : une allocation sur un BL unique doit
rendre la commande ; la recopier rend ce résultat **certain** au lieu de
**prouvé par un test**, sur l'argent réellement facturé tant que E6 n'existe
pas.

### 1.2 Qui écrit les totaux

Tout geste qui écrit un BL depuis la commande (prévision et réécriture à
l'arrêt, BL plein hors plan, réconciliateur d'E2) recopie l'en-tête et
`pickup_discount_eligible` **dans le même `save`**, par l'agrégat (une
méthode `copyTermsFrom(order)` appelée par `planFromOrder` / `replanFrom`).
Le réconciliateur d'E2 complète les BL existants dont l'en-tête est vide.

### 1.3 La migration

Additive : colonnes **nullables** (les BL existants n'ont pas encore leurs
totaux ; le réconciliateur les remplit). Aucune donnée écrite. Un CHECK :
si `total_cents` est renseigné, tous les totaux d'en-tête obligatoires le
sont aussi (tout ou rien).

## 2. Le contrôle qu'E4b exigera

Avant que la facture lise le BL, un contrôle (route staff + compte rendu du
réconciliateur) compare, pour tout BL vivant d'une commande complète :
`FrozenInvoiceOrder` lu sur la commande **=** lu sur le BL, champ par champ.
Zéro écart, ou E4b ne part pas.

## 3. Tests

Domaine : `copyTermsFrom` recopie chaque champ, `NULL` compris (`vat_shares`
d'une commande ancienne) ; `allocateOrderTerms` : Σ = commande sur des
découpes générées (1 à 5 BL, remises % et fixes, port, surtaxe, plusieurs
taux), égalité au plus fort reste. E2E : arrêt du plan → BL avec en-tête égal
à la commande ; réconciliateur → BL d'avant E4a complété ; le contrôle du § 2
rend zéro écart sur le scénario de démonstration.

## 4. Contradiction de `vitruve` (2026-10-24) — l'emporte sur les § 0 à § 3

**BLOQUANT 1 et 2 — il n'y a pas « une seule couture ».** Le relevé lit
lui-même les totaux sur `order` (`prisma-cycle-orders.reader.ts`, l. 49-97 :
`subtotalCents`, remises, port, surtaxe, TVA, total, statut, payeur) ; d'autres
lisent le montant hors couture (`prisma-billable-orders.reader.ts`,
`prisma-detached-unpaid.reader.ts`, `prisma-order-collection.repository.ts`,
`billable-order-criterion.ts`, `prisma-collection-candidates.reader.ts`
l. 96). Le § 0 est faux sur ce point ; le § 1 (« exactement ce que la couture
lit ») aussi, puisque `subtotal_cents` y figurait pour un lecteur non nommé.
**Correction** : E4a vise **tout ce que ces lecteurs additionnent**, pas la
seule couture ; et le **recensement complet** des lecteurs de montants de
commande côté comptabilité devient la **première section du plan d'E4b**,
qui ne se bâtit pas sans lui. Le contrôle du § 2 compare aussi ce que le
relevé et le prélèvement additionnent.

**BLOQUANT 3 — compléter un BL déjà remis.** _Décidé par l'assistant,
2026-10-24_ : le réconciliateur **complète aussi les BL remis** dont l'en-tête
est vide, **à partir des totaux actuels de la commande**, et c'est une
exception écrite à « remis, il ne change plus » : elle **remplit** un champ
vide, elle ne **change** aucune valeur posée. Raison : une commande remise ne
change plus de totaux — l'annulation n'atteint que `placed`
(`cancellationOf`), la révision aussi (`prisma-order-revision.repository.ts`,
`status: placed`), et un remboursement n'écrit pas les totaux de commande
(recherche courte du 2026-10-24, à refaire au bâti sur `totalCents` et
`vatShares`). Si le bâtisseur trouve un écrivain des totaux après remise,
l'exception tombe et le BL remis reste sans en-tête, compté.

**SÉRIEUX, tranchés par l'assistant (2026-10-24) :**

- **`allocateOrderTerms` sort d'E4a.** Personne ne l'appelle avant E6, et ses
  règles ne sont pas toutes décidées (bon de fidélité, remise fixe plus grande
  que le premier BL, surtaxe en %, TVA du port « suit la marchandise »). Elle
  naîtra en E6 avec ses règles et `vitruve`. `splitCents` n'est donc pas
  touché par E4a.
- **Le CHECK « tout ou rien »** porte sur les colonnes entières obligatoires :
  `subtotal_cents`, `discount_cents`, `voucher_discount_cents`,
  `delivery_fee_cents`, `late_fee_cents`, `vat_cents`, `total_cents`.
  `vat_shares`, `delivery_vat_mode`, `late_fee_adjustment` restent nullables
  et recopiés tels quels (une commande ancienne les porte à `NULL`) ; c'est
  `copyTermsFrom`, une seule méthode, qui garantit qu'on ne les oublie pas, et
  son test les nomme un par un.
- **Révision d'une commande au BL prévu** : elle n'existe que sur une commande
  `placed` libérée par une réouverture ; la re-clôture réécrit le BL par
  `replanFrom`, qui appelle `copyTermsFrom`. Test ajouté : arrêt →
  réouverture → révision → re-clôture → en-tête du BL = nouveaux totaux.
- **BL annulé** : il garde les totaux qu'il avait ; on ne les lit jamais pour
  facturer. Le cas « commande annulée après facturation » (`totalCents` remis
  à 0 sur la commande, l. 76 de `prisma-order-cancellation.repository.ts`)
  est un sujet d'E4b, et y est nommé.
- **Après E2** : E4a reprend les fichiers d'E2 ; il ne démarre qu'après le
  commit d'E2, et sa migration vient après celle d'E2.
- **La référence sur la facture** (numéro de commande ou de BL) se tranche en
  E4b ; _proposition de l'assistant_ : la facture cite le **numéro de
  commande**, comme aujourd'hui, et le **numéro de BL** en plus sur la ligne
  du bon — rien ne disparaît de ce qu'un client lit déjà.
