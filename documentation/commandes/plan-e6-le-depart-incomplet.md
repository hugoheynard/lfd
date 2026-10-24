# Plan E6 — le départ incomplet, du colisage à la facture

> **Doc-first, 2026-10-24 (nuit).** Lot E6 du plan-cadre
> [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md),
> fusionné avec E4b ([`plan-e4b-la-facture-lit-les-bons.md`](plan-e4b-la-facture-lit-les-bons.md) § 6).
> Décisions métier de Hugo : [`modification/commandes-incompletes.md`](modification/commandes-incompletes.md) § 4.
> Choix de conception : **l'assistant** (Hugo, 2026-10-24 : « prends les
> décisions »), chacun marqué _Décidé par l'assistant_. Touche **l'argent** :
> `vitruve` avant le bâti. **Rien n'est bâti.**

## 0. Ce qui existe (ouvert le 2026-10-24)

- **Fermer le bac** : `ClosePackingOrderHandler`
  (`packing/application/station/close-packing-order.handler.ts`) verrouille la
  fiche, `sheet.seal(…)` (refuse `UnallocatedLinesError` tant qu'une ligne due
  n'est pas entièrement répartie), publie `PackingOrderPackedEvent`
  (`production/channels/packing/`, sans quantités).
- **Le commerce** passe la commande `ready` par l'abonné
  `on-packing-order-packed.handler.ts`, puis le BL suit (E2,
  `DeliveryNoteFollowing.prepare`, sous l'écriture gagnée). Un BL `planned`
  est **réaligné sur les lignes de la commande** avant d'avancer (E2).
- **Une seule définition des totaux** : `computeOrderTotals`, appelée par
  `Order.draft` (`b2b/orders/domain/entities/order.ts`, l. 135-147) — lignes
  (HT, taux, éligibilité à la remise de retrait), remise, bon, port, mode de
  TVA du port, surtaxe et son taux → TVA, ventilation, total.
- **Les ajustements figés** sur la commande : `discountAdjustment`,
  `deliveryFeeAdjustment`, `lateFeeAdjustment` (`CartAdjustment` : % ou montant
  fixe ; `cartAdjustmentCents` dans `packages/contracts/src/cart-adjustment.ts`).
- **La facture** lit la commande par la couture `FROZEN_INVOICE_ORDER_SELECT`
  et treize lecteurs (recensement du § 0 d'E4b, complété par le § 5) ; une
  commande se facture une fois (`invoice_order_invoiced_once`).

## 1. Le parcours

```mermaid
sequenceDiagram
  participant Col as Colisage
  participant Com as Commerce
  participant Dec as Décideur (permission)
  Col->>Col: une ligne ne se remplit pas
  Col->>Com: « il manque » — fait packing.shortfall_reported (quantités au bac)
  Com->>Com: la commande : décision attendue
  Dec->>Com: décide : ça part ; reste : à relivrer (date) ou abandonné
  Com->>Col: ShortfallDesk.authorize(commande, quantités)
  Col->>Col: la ligne due devient la quantité au bac ; seal passe
  Col->>Com: bac fermé (fait existant)
  Com->>Com: BL-1 préparé AUX QUANTITÉS DÉCIDÉES, totaux répartis
  Note over Dec: « Écrire au client » : un geste à part, jamais automatique
```

## 2. Les lots

| Lot     | Contenu                                                                                                                                                                                                                                           | Argent                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **E6a** | « Il manque » au colisage, le fait, la commande « décision attendue » (colonne `shortfall_reported_at` + quantités), visible dans la page Commandes et la Supervision                                                                             | non                     |
| **E6b** | La décision : ressource `b2b_orders_shortfall`, écran sur la fiche commande, table `order_shortfall_decision`, `ShortfallDesk` (déclaré **et** implémenté par le colisage dans `packing/channels/commerce/`), BL-1 préparé aux quantités décidées | les quantités seulement |
| **E6c** | Les totaux d'un BL partiel (répartition), la commande **soldée**, la facture qui lit les montants facturables                                                                                                                                     | **oui**                 |
| **E6d** | « Écrire au client » : gabarit modifiable, envoi tracé sur la décision                                                                                                                                                                            | non                     |

## 3. E6a — le signal

- **Colisage** : un geste « Il manque » sur une fiche ouverte dont une ligne
  n'est pas entièrement répartie ; il fige les quantités **actuellement au
  bac** par SKU et publie `packing.shortfall_reported`, déclaré dans
  `packing/channels/commerce/` (clé `shortfall:<orderId>` ; un second
  signalement avant la décision **remplace** les quantités). La fiche reste
  ouverte.
- **Commerce** : un `@DurableHandler` pose `shortfall_reported_at` et les
  quantités sur la commande ; la page Commandes et la Supervision montrent
  « décision attendue ».
- _Décidé par l'assistant_ : un signalement **ne bloque rien d'autre** (la
  commande peut encore être complétée si le fournil livre la pièce ; refermer
  le bac complet efface le signal).

## 4. E6b — la décision

- **Permission** `b2b_orders_shortfall`, accordée à l'écran ; geste au
  déploiement écrit au runbook.
- **La décision** (agrégat `ShortfallDecision`, une par commande, définitive —
  Q-I4) : auteur, instant, quantités partantes (celles du signal), reste :
  `to_redeliver` + date, ou `abandoned`.
- **`ShortfallDesk.authorize`** : le colisage réduit la ligne due de la fiche
  aux quantités décidées, dans la transaction de la décision ; `seal` passe
  sans exception à sa règle (la ligne due **est** la quantité au bac).
- **Le BL-1** : au bac fermé, le suivi d'E2 prépare le BL-1 **aux quantités de
  la décision** (et non plus en le réalignant sur la commande) ; le reste
  n'est pas sur ce BL. _Décidé par l'assistant_ : le réalignement d'E2 ne
  s'applique pas à une commande qui porte une décision.
- `to_redeliver` : la date est enregistrée ; le BL-2 naît en **E7**.
  `abandoned` : la commande est **soldée** à la remise du BL-1 (E6c).

## 5. E6c — l'argent

### 5.1 Les totaux d'un BL partiel — `computeOrderTotals`, jamais une seconde formule

Les lignes du BL (quantités livrées, prix et taux figés de la commande, HT de
ligne par la fonction de prix de ligne existante) passent par
**`computeOrderTotals`**, avec ces termes répartis :

| Terme de la commande                     | Sur le BL-1 partiel                                        | Sur un BL de reliquat (E7)          |
| ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------- |
| remise en **%** (`discountAdjustment` %) | recalculée sur le sous-total du BL (`cartAdjustmentCents`) | idem                                |
| remise **fixe**                          | entière, **plafonnée** au sous-total du BL                 | 0                                   |
| bon de fidélité                          | entier, plafonné à l'assiette du BL                        | 0                                   |
| frais de port                            | entiers (Q-I2 de Hugo)                                     | 0 (Q-I2 : c'est nous qui relivrons) |
| surtaxe                                  | entière (Q-I2)                                             | 0                                   |

_Décidé par l'assistant_ : plafonner une remise fixe ou un bon au sous-total
du BL plutôt que de reporter un reste — un BL n'a jamais un total négatif ;
la part non consommée n'est pas due au client (elle portait sur des articles
non livrés). Conséquence assumée et dite : pour une commande livrée en
**plusieurs** BL, Σ des BL peut différer de la commande de quelques centimes
d'arrondi de TVA ; la facture somme les BL, qui sont ce qui a été livré.

### 5.2 La commande soldée et facturable

- **Soldée** : tout ce qui reste à livrer est livré, ou abandonné par
  décision. Une commande sans décision est soldée à sa remise, comme
  aujourd'hui.
- _Décidé par l'assistant_ : les montants facturables sont **tenus sur la
  commande**, dans des colonnes `billable_*` (sous-total, remises, bon, port,
  surtaxe, TVA, ventilation, total), écrites **au solde** = Σ des BL remis
  (ou recopie exacte de la commande pour une commande à un BL complet,
  c'est-à-dire aujourd'hui). Les treize lecteurs gardent leur forme SQL et
  lisent `billable_*` au lieu des totaux de commande ; la couture lit les
  **lignes** des BL remis. Une commande non soldée n'a pas de `billable_*` et
  n'est pas facturable (garde-fou : elle est écartée et nommée, comme
  `invoice-issuance-blockers.ts`).
- **La date** qui range une commande dans une facture reste
  `orders.received_on` (la première remise). _Décidé par l'assistant_ : pour
  un reliquat livré plus tard, la commande se range au mois de son **solde**
  par une colonne `settled_on`, posée au solde ; le critère `billableOrderWhere`
  lit `settled_on`. Aujourd'hui `settled_on = received_on` pour toute commande.
- **Rattrapage** : le réconciliateur pose `billable_*` et `settled_on` sur
  toute commande remise sans décision (recopie), avant que les lecteurs
  basculent ; la bascule ne part qu'à **zéro écart** (contrôle d'E4a étendu).

## 6. Questions laissées à Hugo (pour demain)

- Le plafonnement d'une remise fixe sur un BL partiel (§ 5.1) : d'accord ?
- `settled_on` (une commande à reliquat se facture au mois de son solde) :
  d'accord ?

## 7. Contradiction de `vitruve` (2026-10-24, nuit) — l'emporte sur les § 2 à § 6

**BLOQUANTS, et ce qui change :**

1. **La facture carte** part à la première remise, au montant entier
   (`issue-card-invoice-on-fulfilled.handler.ts` écoute `OrderHandedOverEvent`),
   et un départ incomplet d'une commande payée par carte laisserait un
   trop-perçu que personne ne rend. _Décidé par l'assistant_ : **E6 ne vise
   que les commandes au compte** (Q-I3 de Hugo) ; la décision est **refusée**
   sur une commande carte (refus nommé : « commande réglée par carte : le
   départ incomplet viendra avec le remboursement partiel, E9 »).
2. **Le prélèvement** lit `order.totalCents` (`prisma-collection-candidates.reader.ts`,
   l. 96 et 207) et `order_collection.amount_cents` : il entre dans le
   périmètre d'E6c, nommé.
3. **Le contrôle de cohérence** (`invoice-order-consistency.ts`,
   `inconsistentOrders`) recompose et compare à `order.totalCents` : en E6c,
   il recompose sur les montants facturables et compare à `billable_total` ;
   ce changement est décidé dans le plan d'E6c, pas laissé au bâti.

**SÉRIEUX — à reprendre dans le plan d'E6c avant tout bâti** :

- Les totaux d'un BL partiel ne se calculent pas « avec `computeOrderTotals`
  et des termes répartis » à la main : les règles vivent dans `Order.draft`
  (`ensureDiscountMatches` sur l'assiette **éligible**, `voucherDiscountOf`,
  `ensureLateFeeMatches`). E6c extrait ces règles en fonctions du domaine et
  les applique au BL par **une** fabrique (même rôle qu'`Order.draft`),
  pour qu'aucune formule n'existe en double ; l'asymétrie remise % / surtaxe %
  y est tranchée et justifiée.
- `billable_*` : nommer l'agrégat qui les écrit et ce qui interdit de les
  réécrire ; prévoir les déploiements (colonnes nullables, rattrapage, bascule)
  et l'écrivain des commandes remises entre deux ; les deux critères
  `billableOrderWhere` **et** `billableSinceWhere` ; recompter les lecteurs ;
  Factur-X. Signaler que `billable_*` et `settled_on` deviennent des faits
  comptables à la première facture émise.
- `ShortfallDesk` et la fiche réécrite par le fournil (`on-packing-list-drawn`,
  `on-production-day-reopened`) : qui gagne après une décision ; l'ordre des
  verrous commande / fiche ; une décision qui arrive sur une fiche déjà
  scellée ; « la pièce arrive après la décision ».

## 8. Ce qui se bâtit, et quand (_décidé par l'assistant_, 2026-10-24, nuit)

- **E6a se bâtit maintenant** : le signal et « décision attendue » ne touchent
  ni l'argent ni la fiche du fournil, et rendent déjà le manque visible.
- **E6b et E6c attendent la validation de Hugo** du plan d'E6c corrigé, et
  partiront **ensemble** : une décision sans la facture qui la suit
  produirait un BL partiel facturé en entier.
- **E6d** (l'e-mail à la main) suit E6b.
