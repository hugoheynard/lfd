# Plan A1 — retirer une commande inscrite au plan

> 🟡 **2026-10-25 : A1.2 bâti, pas encore commité.** Migration
> `20261025210000_retirer_une_commande_inscrite` (`order_withdrawal.after_inscription`,
> `packing_order.withdrawn_at`). Le guichet du fournil prend l'autorisation ;
> `PackingWithdrawalDesk` (`packing/channels/commerce/`) retire la feuille ou
> pose la pierre tombale, par `PackingContainerVoiding` extrait de
> l'annulation de contenant ; `PackingSheet.assertNotWithdrawn` garde chaque
> geste. Le noyau appelle les deux par `OrderWorkshopWithdrawal`. Choix de
> bâti à relire : l'en-tête de la pierre tombale vient du fournil par un port
> qu'il publie (`InscribedOrderHeaderReader`, `production/channels/packing/`),
> absent du tableau du § 2.1 ; son `drawn_at` est l'instant du retrait. Les
> faits et `order.cancelled` étendu restent au lot A1.3. E2E écrits, pas
> encore passés.

> 🟡 **2026-10-25 : A1.1 bâti, pas encore commité.** Le réglage
> `b2c_cancellable_until` (migration `20261025190000_jusqu_ou_un_particulier_annule`),
> l'écran Réglages › Commandes, et l'autorisation calculée une fois par le
> noyau (`CancellationAllowanceGate`). `before_packing` ne lève PAS encore le
> refus « inscrite » : choisir « prête » ne change rien tant qu'A1.2 n'est pas
> bâti. Vérifié au bâti : l'arrêt automatique tombe au plus tôt à la fin de la
> grâce (`production/domain/services/latest-order-cutoff.ts`, `planClosesAt`).

> **Doc-first, 2026-10-25. Rien n'est bâti.** Premier lot né de
> l'[étude de l'arrêt du plan](../etude-arret-du-plan-publication.md) (§ 5,
> « A1 d'abord », Hugo le 2026-10-25). Touche l'argent (remboursement) et deux
> migrations : contredit par `vitruve` le même jour (§ 6), corrigé ici.
> Chemins relatifs à `apps/lfd-api/src/` sauf mention ; chaque affirmation
> sur le code ouverte le 2026-10-25.

## 0. A1 reprend les décisions de C7, pas sa mécanique

Le geste a été conçu le 2026-10-13 par le plan C7,
[`plan-annulation-apres-production.md`](plan-annulation-apres-production.md),
jamais bâti (`packing_order` n'a pas de `withdrawn_at`). **Ses décisions de
Hugo restent** ; **sa mécanique est remplacée** par celle du présent plan :
le colisage a changé depuis (rendu à la réserve, gestes du manque, ports
ouverts au commerce, réouverture de journée), et C7 § 3.2–3.3 ne tient plus.

| Décision de C7 (Hugo, 2026-10-13) — inchangée                                                   |
| ----------------------------------------------------------------------------------------------- |
| Un **réglage** global pour les particuliers, choix d'étape ; valeur au départ « arrêt du plan » |
| Étape A1 : `ready` (jusqu'à ce que la commande soit prête) ; C7b (`handover`) hors lot          |
| On ne défait **ni bac de livraison ni tournée** : une livraison inscrite est refusée            |
| Le **staff suit** la même limite que le particulier ; les **pros** ne sont pas concernés        |
| Le compte du fournil ne bouge pas ; ce qui était au bac revient au colisage                     |

## 1. Le critère (C7 § 3.1, inchangé sauf le point 4)

Commande **personnelle**, étape `ready` :

1. la règle actuelle, sauf le refus « inscrite » ;
2. `orders.status = ready` → refus `ready` ;
3. livraison inscrite → refus `delivery_after_plan` ;
4. **la feuille du colisage, sous son verrou** : fermée (`packed_at`) →
   `packed` ; un contenant porte un bac de livraison vivant → `delivery_bin`.
   Une feuille dont le **départ incomplet est autorisé** ne peut pas exister
   ici : `ShortfallDecision.decide` refuse une commande payée par carte
   (`b2b/orders/domain/errors/shortfall-decision-errors.ts`, `CardOrderShortfallError`) et
   un particulier paie par carte ;
5. `updateMany` conditionné ; 0 ligne → `state_changed`, tout s'annule.

## 2. La mécanique (remplace C7 § 3.2–3.3)

### 2.1 Les ports — le précédent `ShortfallDesk`

Depuis R3b (2026-10-21), le commerce appelle le colisage **directement** par
`packing/channels/commerce/` (`ShortfallDesk`, appelé par
`decide-order-shortfall.handler.ts`, ordre commande → feuille). A1 le suit,
et abandonne les détours de C7 par le fournil :

| Port                                      | Déclaré et implémenté par | Appelé par                      |
| ----------------------------------------- | ------------------------- | ------------------------------- |
| `OrderWithdrawalDesk.withdraw` (étendu)   | le fournil (existant)     | l'annulation                    |
| **`PackingWithdrawalDesk.withdraw`**      | le colisage               | l'annulation, après le fournil  |
| **`OrderPackingStateReader.packedAmong`** | le colisage               | boutique, back-office (lecture) |

Le guichet du fournil gagne une autorisation (`before_inscription` |
`before_packing`) et une issue `withdrawn_after_inscription` ; il écrit
`order_withdrawal.after_inscription = true`. Il ne touche plus au colisage.

### 2.2 Retirer la feuille — par le geste existant

`PackingWithdrawalDesk.withdraw(day, orderId)`, dans l'unité de travail de
l'appelant :

1. pose `withdrawn_at` (colonne neuve de `packing.packing_order`) par
   `INSERT … ON CONFLICT DO UPDATE … WHERE packed_at IS NULL`, comme C7 — la
   pierre tombale si la feuille n'est pas encore tirée ;
2. **pour chaque contenant vivant**, le geste d'annulation de contenant **tel
   qu'il existe** (`void-packing-container.handler.ts`) : `BinDesk.voidBin`
   si le contenant porte un bac, `sheet.voidContainer`, `releaseToStock`
   (`stock.release`), `PackingContainerVoidedEvent`. **Pas `giveBack`** :
   c'est le retour au fournil, il incrémente `returned` et laisserait les
   pièces comptées « au bac » (`packing/domain/entities/packing-stock.ts`,
   `vitruve` B1). La logique commune est extraite du handler en un service
   d'application du colisage, appelé par les deux.
3. `drawOrder` n'insère pas les lignes d'une feuille retirée (C7, inchangé).

**Le surplus rendu n'est pas réservé à la vente** : la réserve libre exclut
les réservations de réassort (R4b), une pièce relâchée peut donc partir dans
un réassort lancé. C'est le bon usage du pain ; ce qui reste visible, c'est
**le fait** `packing.sheet_withdrawn` et ses lignes rendues, au journal et au
poste — pas une quantité garantie.

### 2.3 Une feuille retirée ne bouge plus — une seule garde

`PackingSheet` gagne `assertNotWithdrawn()`, appelé en tête de **chaque**
méthode qui mute : `seal`, `reportShortfall`, `authorizeShortfall`, `reopen`,
`openContainer`, `allocate`, `withdraw`, `move`, `voidContainer`,
`assertCanApplyProposal`, `assertCanOpenContainer`, et le partage d'un bac
(`get-shareable-halves` → `BinDesk`). Le geste de retrait (§ 2.2) vide les
contenants **avant** de poser la marque, dans la même transaction. Test : un
test paramétré appelle chaque méthode publique mutante sur une feuille
retirée et attend `PackingSheetWithdrawnError` — la liste vient du prototype,
pour qu'une méthode ajoutée demain sans garde fasse rougir.

### 2.4 L'ordre des verrous

Lu dans `b2b/orders/application/services/order-cancellation.service.ts` :
ligne `orders` → journée du fournil (`withdrawFromBakery`) → **feuille → bac
(`BinDesk`) → réserve, triée par SKU** (neuf, A1) → BL (`voidLiveFor`) → bon
→ remboursement. Les autres chemins qui prennent la feuille :
`DecideOrderShortfall` (commande → feuille), `VoidPackingContainer` (feuille
→ bac → réserve), la fermeture (feuille seule) : même sens. **À prouver au
bâti** par un test de course annulation × décision de manque, et annulation ×
fermeture du bac.

### 2.5 La réouverture de la journée

`PrismaPackingListWithdrawal.withdrawUntouched` efface les feuilles non
entamées, pierre tombale comprise, et `startedOn` ne la compte pas. **C'est
voulu** : rouvrir n'est permis que si rien n'a commencé
(`assertReopenable`), donc rien n'a été fabriqué pour cette commande ; à la
reclôture, une commande annulée n'est pas réinscrite, et le compte baisse
**parce qu'il n'y a rien à produire**. La promesse « compte inchangé » de C7
vaut pour une journée qui continue, pas pour une journée rouverte. Le retrait
reste écrit au fournil (`order_withdrawal`). Test e2e : arrêt → annulation →
réouverture → reclôture.

### 2.6 Le manque signalé d'un particulier

`reportShortfall` n'a pas de condition de clientèle : un particulier peut
avoir un manque signalé. L'annulation retire la feuille ; côté commerce, le
signal **reste écrit** (c'est de l'histoire), mais la liste « décision
attendue » ne retient que les commandes non annulées — la supervision le
fait déjà (`day-supervision.ts`), le lecteur de la liste admin
(`prisma-admin-order-list.reader.ts`) l'ajoute. Test : signalé → annulé →
absent de « décision attendue ».

### 2.7 Le bon de livraison

L'annulation l'annule déjà, dans la transaction : `voidLiveFor`. Un BL
`handed_over` rendrait `unrepairable`, mais une commande remise est refusée
bien avant. Test : annulée après l'arrêt → BL `voided`.

## 3. Ce qui devient irréversible en production

- l'enum `customer_cancellation_stage` (valeurs `production_plan`, `ready`) ;
- les noms des faits durables `production.order_withdrawn_after_close` et
  `packing.sheet_withdrawn`, et leur charge ; **aucun abonné** n'est prévu —
  s'il en vient un d'un autre bloc, `lint:durable-cross-block` s'applique ;
- les deux champs ajoutés au fait journalisé `order.cancelled`
  (`afterInscription`, `stageApplied`), lus `false` / `production_plan` sur
  les faits anciens ;
- les colonnes `packing_order.withdrawn_at` et
  `order_withdrawal.after_inscription`.

## 4. Décisions de Hugo (2026-10-25)

| #   | Question                                     | Décision                                                                                                                                                                |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Retirer une commande **de société** inscrite | **Non.** Avant l'arrêt, le staff annule déjà, heure limite et grâce ignorées (R1) ; après l'arrêt, « c'est de la quantité » : départ incomplet ou avoir.                |
| Q2  | Aller jusqu'au retrait au comptoir (C7b)     | **Non.** Jusqu'où un particulier peut annuler reste une **décision de l'admin**, au réglage : « arrêt du plan » ou « prête ».                                           |
| Q3  | Remboursement intégral après l'arrêt         | **Oui** (noyau C4).                                                                                                                                                     |
| Q4  | Le pain rendu par une annulation             | **Un geste pour le vendre** : « Envoyer en boutique » depuis la réserve du colisage (lot A1.4). Rien ne s'encaisse par notre système : la boutique le vend à sa caisse. |

**À vérifier au bâti (A1.1)** : l'arrêt automatique du plan doit tomber après
la fin de la grâce (`order_cutoff.grace_minutes`) ; sinon une commande prise
au téléphone pendant la grâce est déjà inscrite, et le staff ne peut plus
l'annuler.

## 5. Lots

| Lot      | Contenu                                                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1.1** | Le réglage (migration de l'enum), l'écran Réglages, `cancellationOf` avec l'autorisation                                                                             |
| **A1.2** | Le guichet du fournil étendu, `PackingWithdrawalDesk`, `withdrawn_at` (migration), le service d'annulation de contenant extrait, la garde de la feuille, `drawOrder` |
| **A1.3** | Journal, cloche, badges, `OrderPackingStateReader`, la liste « décision attendue »                                                                                   |

Tests : C7 § 5, plus ceux des §§ 2.3 à 2.7.

## 6. Contradiction de `vitruve` (2026-10-25)

La première version disait « bâtir C7 tel quel ». Retenu et corrigé :

- **B1** — C7 rendait au bac par `giveBack` (le retour au fournil) : § 2.2.
- **B2** — la liste des gestes refusés sur une feuille retirée était
  périmée (cinq handlers neufs depuis C7) : § 2.3, une garde unique et un
  test qui lit le prototype.
- **S3** — les détours par le fournil dataient d'avant R3b : § 2.1.
- **S4** — la réouverture de journée efface la pierre tombale : voulu,
  écrit et testé, § 2.5.
- **S5** — « départ incomplet décidé » est impossible pour un particulier ;
  le vrai cas est le manque **signalé** : § 1 point 4 et § 2.6.
- **S6** — l'ordre des verrous réel inclut le BL et le bac : § 2.4.
- **S7** — les irréversibilités : § 3.
- **Mineur** — le BL s'annule par `voidLiveFor`, pas par le suiveur : § 2.7.
