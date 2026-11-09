# Le paiement et le remboursement — relecture contre le code

> **Écrit le 2026-11-09**, à la demande de Hugo : « on prend le temps, on fait
> une relecture contre le code de tout le système pour le remboursement et le
> paiement ; on doit pouvoir changer de mode de paiement facilement, donc être
> en maîtrise totale de l'état de la commande ». Tout ce qui suit a été **lu
> dans les fichiers ce jour-là** (chemins sous `apps/lfd-api/src/`) ; rien n'est
> repris de mémoire ni des plans. C'est un **état des lieux**, pas un plan : il
> prépare le document unique qui remplacera les §9–§20 de
> [`../modification/plan-modifier-une-commande-payee-par-carte.md`](../modification/plan-modifier-une-commande-payee-par-carte.md).

## Partie 1 — ce qu'il faut comprendre

### Comment ça marche aujourd'hui, en cinq phrases

1. **Une commande a au plus un paiement.** Quand une carte est requise, on
   crée chez Stripe une « intention » du montant total, on écrit son
   identifiant sur la commande, et le client paie dans la boutique. La
   commande reste « en attente » tant que Stripe n'a pas confirmé.
2. **Stripe nous prévient par webhook** : payé, ou refusé. On ne croit jamais
   le navigateur, seulement le webhook signé.
3. **Le fournil ne fabrique que ce qui est payé** (ou ce qui n'a pas à l'être,
   au compte). Une commande carte non payée à l'arrêt du plan est annulée.
4. **Annuler une commande payée = demander à Stripe de rendre tout ce qui
   reste.** La demande est écrite en base, un exécuteur l'envoie à Stripe
   après coup, Stripe confirme par webhook, et on note chaque remboursement
   dans un « carnet ».
5. **La facture carte** (pros seulement) naît au retrait, pour le total ; un
   remboursement constaté après produit un avoir.

### Ce qui est solide

- Chaque écriture d'état est **conditionnée en base** (« passe à payé _si_ tu
  étais en attente ») : deux webhooks, deux clics ou un rejeu ne font jamais
  deux fois la même chose.
- **Stripe n'est jamais appelé dans une transaction** ni dans un abonné
  durable : l'exécuteur prend un bail, appelle, puis écrit l'issue à part.
- **Un `re_…` émis et perdu est retrouvé** par la recherche chez Stripe
  (métadonnées), jamais réémis.
- Les faits qui comptent (payé, refusé, remboursé) sont **durables** : un
  redémarrage ne perd ni un courriel ni une facture.
- L'argent est en **centimes entiers**, en euros seulement.

### Ce que ce système ne sait pas faire — et c'est exactement ce que M2 demande

| Il faudrait                                                        | Aujourd'hui                                                                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| rembourser **un montant**                                          | on ne sait que rendre **tout ce qui reste** d'un paiement                                                                           |
| **plusieurs paiements** sur une commande                           | **un** identifiant d'intention, unique, sur la ligne de la commande ; le webhook ne retrouve la commande que par lui                |
| **plusieurs remboursements à faire** sur une commande              | **une** demande par commande (c'est sa clé primaire)                                                                                |
| savoir où en est une demande sans la recalculer                    | son état est **déduit** à chaque lecture (du carnet et d'un identifiant), jamais écrit                                              |
| un plafond « remboursé ≤ encaissé »                                | le plafond lit le **total de la commande**, qui changera avec une modification                                                      |
| une comptabilité qui distingue « trop-perçu » et « vente annulée » | **tout** remboursement réussi d'une commande facturée produit un avoir ; une commande remboursée à ≥ 50 % n'est **jamais facturée** |

### Changer de prestataire : ce que ça coûterait vraiment

Le domaine ne connaît Stripe que par **trois ports** (créer / relire / annuler
une intention et vérifier un webhook ; rembourser ; ouvrir une page de
paiement hébergée). Changer de banque, c'est réécrire **cinq fichiers
d'adaptateur** (~700 lignes) et le branchement du webhook, **sans toucher aux
commandes, à l'annulation ni à la comptabilité**. C'est la bonne nouvelle.

Ce qui **fuit** quand même, et qu'il faudra nettoyer un jour (pas forcément
avant M2) :

- la page de paiement de la **boutique** est écrite pour Stripe (Payment
  Element, `clientSecret`, `publishableKey`) — une banque imposera souvent une
  page hébergée ou un autre widget ;
- les **statuts de remboursement** du domaine sont ceux de Stripe, recopiés
  « tels quels » (`requires_action`…) ;
- trois **colonnes** et quelques champs de contrat portent le mot « stripe »
  dans leur nom ;
- aucun **rapprochement périodique** avec le prestataire n'existe : on ne
  relit Stripe que pour retrouver un remboursement qu'on a soi-même émis.

### Les angles morts trouvés (détail en partie 2, § E)

Rien d'alarmant pour l'usage d'aujourd'hui — une seule intention, un
remboursement intégral — mais chacun devient un trou dès qu'une commande a
plusieurs paiements ou un remboursement partiel :

1. un paiement réussi sur une intention **inconnue** est **silencieux** ;
2. un remboursement **inversé** (la banque refuse le crédit) n'est traité que
   sur une commande **annulée** ;
3. le remboursement à la main depuis le tableau de bord Stripe est admis
   (« rien ne partira ») mais, s'il est **partiel**, l'exécuteur rendra ensuite
   **tout le reste** ;
4. une commande dont le total serait révisé garde un carnet plafonné sur
   **l'ancien** total ;
5. le passage « payé → remboursé » se fait à l'**égalité stricte** avec le
   total — faux dès qu'un total bouge.

### Ce que ça impose au plan M2

**D'abord un socle, sans aucune règle de modification** : état **écrit** des
demandes de remboursement (plus déduit), demande **par remboursement à faire**
(plus par commande), **intention et cause** sur chaque ligne du carnet,
**montant** dans le port de remboursement, encaissé **figé** à part du total,
et un **rapprochement quotidien** avec le prestataire. Ce socle rend le
système lisible, prêt pour plusieurs paiements, et plus facile à migrer. Puis
seulement la baisse, puis la hausse.

## Partie 2 — le détail technique

### A. Les objets et leurs états, tels qu'ils sont

#### A1. Le règlement de la commande — `orders.payment_status`

Enum Postgres `PaymentStatus` : `not_required | pending | paid | failed |
refunded`. Deux colonnes voisines : `stripe_payment_intent_id` (`@unique`,
nullable) et `paid_at`.

| Transition                                 | Écrite par                                                                         | Condition (`where`)                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ∅ → `pending` + intention                  | `Order.payByCard` → `place()`                                                      | total > 0 et carte requise (`order-settlement.ts`)    |
| ∅ → `not_required`                         | `Order.deferPayment`                                                               | compte, ou total nul                                  |
| `pending\|failed` → `paid` (+ `paid_at`)   | `markPaid` (webhook)                                                               | `status ≠ cancelled` — **jamais rouverte**            |
| `pending` → `failed`                       | `markPaymentFailed` (webhook)                                                      | —                                                     |
| `pending\|failed` → `failed` + `cancelled` | `markAbandoned` (public), `failAtClosing` (clôture), `UnsettledShopOrderCanceller` | `status = placed`                                     |
| `pending` → `failed` (reste `placed`)      | `markAbandoned` (pro : l'intention reste vivante)                                  | —                                                     |
| `paid` ↔ `refunded`                        | `OrderRefundLedger.settle` → `save`                                                | `Σ succeeded = total_cents` (↓) / `< total_cents` (↑) |

Lecteurs de la règle : `settlementRegimeOf` (`account | due | paid | free`,
dérivé — `production-plan.ts`, `settlement-regime.ts`), `absorbedByPlan` /
`planWhere` (seul `paid` ou `not_required` est produit).

**Fichiers** : `orders/domain/entities/order.ts`,
`orders/infrastructure/prisma-order.repository.ts`,
`orders/application/commands/confirm-order-payment.handler.ts`,
`abandon-order.handler.ts`, `pending-settlement-sweep.service.ts`,
`unsettled-shop-order-expiry.service.ts`, `orders/domain/services/production-plan.ts`.

#### A2. Le carnet — `order_refund`

Une ligne par `re_…` (`stripe_refund_id @unique`), montant > 0 (CHECK),
`status` = enum `OrderRefundStatus` **recopié de Stripe** (`pending |
requires_action | succeeded | failed | canceled`), `credit_note_id` posé une
fois (déclencheur `order_refund_credit_note_once`). **Pas de colonne
intention, pas de cause.**

Agrégat `OrderRefundLedger` (`orders/domain/entities/order-refund-ledger.ts`),
chargé **sous `FOR UPDATE` de la ligne `orders`** (`loadByPaymentIntent` /
`loadByOrder`) : idempotent par `re_…`, statut qui ne régresse pas
(`refundTransition` : `succeeded → failed` admis, `→ canceled` illégal), euros
seulement, **`Σ succeeded ≤ chargedCents`** où **`chargedCents =
orders.total_cents`** (deux lecteurs : `prisma-order-refund.repository.ts`,
`prisma-order-refund-request.reader.ts`), et `settle()` qui bascule le
règlement.

#### A3. La demande — `order_refund_request`

**Clé primaire `order_id`** : une demande par commande. Colonnes : `cause`
(enum `cancellation | paid_after_cancellation | refund_reversed`),
`announced_cents` (> 0), `generation` (≥ 1), `stripe_refund_id` (`@unique`,
posé ⇔ `issued_at`), `attempts`, `last_failure`, `round`, `claimed_until` /
`claim_token` (le bail), `next_attempt_at`.

**L'état n'est pas stocké** (`refundRequestStateOf`,
`order-refund-request.ts`) :

| Lu         | Quand                                                                   |
| ---------- | ----------------------------------------------------------------------- |
| `to_issue` | pas de `re_…` pour la génération, et le carnet laisse un reste          |
| `refunded` | le `re_…` a réussi, **ou** pas de `re_…` et le carnet ne laisse rien    |
| `issued`   | le `re_…` attend (`pending`, `requires_action`), ou n'est pas au carnet |
| `failed`   | le `re_…` est `failed` ou `canceled` → génération suivante due          |

« Arrêté » (`stopped()` : `declined`, `nothing_left`, `rejected`, `no_payment_intent`)
n'est **pas** un état : c'est `next_attempt_at = null` + `last_failure` ; la
demande se **lit** toujours `to_issue`, et « Relancer » (`retry-order-refund.handler.ts`)
la reprogramme. `unavailable()` pose `last_failure = "unavailable"` et un
`next_attempt_at` sur la courbe de la boîte d'envoi (30 s, ×2, plafond 6 h).

Le cycle (`issue-order-refund.handler.ts`, C4.7) : **bail** (`updateMany`
conditionné, horloge murale, 5 min, hors transaction) → **`prepare()`** sous
le verrou `orders` (état lu, génération rouverte si `failed`) → **Stripe hors
transaction** (`refundRemainder` = recherche par métadonnée puis `create`
**sans montant**, clé `lfd-order-refund:<orderId>:<gen>:<round>`) →
**`RefundIssuanceRecorder.record`** (transaction courte : carnet, journal,
fait `order.refund_succeeded`, demande relue sous bail et génération).
`nothing_left` → relecture ; si le carnet laisse encore un reste → `stopped`
(écart à la main) ; sinon rien (se lit remboursée).

Écrivains d'une demande : `CancellationRefundRequester` (annulation régime
`paid`, montant = `refundableCents`), `RefundPaidAfterCancellation` (abonné
durable), `ReopenRefundOnReversal.open` (abonné durable, sans échéance).
Lanceurs : `OrderRefundDispatch.afterCommitFor` (après validation, fond),
`SweepOrderRefundsHandler` (cron, `next_attempt_at ≤ mur`, `stripe_refund_id`
nul).

#### A4. Le constat d'un remboursement (webhook)

`refund.created|updated|failed` → `RecordOrderRefundCommand(paymentIntentId,
report)` → `loadByPaymentIntent` (**par `orders.stripe_payment_intent_id`
seulement**) → `ledger.record` → `save` → journal → `order.refund_succeeded`
(durable) ; `failed|canceled` → `order.refund_failed` ou
`order.refund_reversed` (si avant `succeeded`). Intention inconnue →
`RefundWithoutOrderEvent` → journal + cloche (`on-refund-without-order.handler.ts`).
Le constat **ne touche pas la demande** : son état se lira au carnet.

#### A5. Le lien de paiement libre — `payment_links`

Agrégat `PaymentLink` (`open → paid | cancelled | expired`, et `cancelled →
paid` assumé). Session Checkout hébergée, métadonnée `paymentLinkId` recopiée
sur l'intention. **Sans commande** : un remboursement dessus est « hors
commande » (A4).

### B. Les gestes, dans l'ordre où ils écrivent

| Geste                     | Ordre                                                                                                                                                      | Fichier                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Passation carte           | composer → `createIntent` (hors transaction) → transaction : journée/stock, bon, `place()`, clé d'idempotence, faits ; échec ⇒ `cancelIntent`              | `place-order.handler.ts` (et `place-shop-order`, `place-order-for-customer`) |
| Page de règlement         | relit l'intention chez Stripe (`retrieveIntent`) : refuse `canceled` / `succeeded` ; **aucune intention n'est jamais recréée**                             | `get-order-payment.handler.ts`                                               |
| Webhook payé              | `markPaid` + `order.paid` (durable) dans une unité ; rien franchi + commande annulée ⇒ `order.paid_after_cancellation`                                     | `confirm-order-payment.handler.ts`                                           |
| Abandon (client)          | public : `cancelIntent` **puis** `markAbandoned` → `cancelled`+`failed`, bon libéré ; pro : `failed` seulement, intention vivante                          | `abandon-order.handler.ts`                                                   |
| Expiration boutique       | particulier sans société, 30 min (ou durée de la vitrine) : `cancelIntent` puis `cancelled`+`failed` ; `already_paid`/`in_progress` ⇒ gardée               | `unsettled-shop-order-expiry.service.ts`                                     |
| Clôture du fournil        | toutes clientèles, `placed` + `pending\|failed` du jour : `cancelIntent` (épargne si payé/en cours) puis `cancelled`+`failed`                              | `pending-settlement-sweep.service.ts`                                        |
| Annulation (staff/client) | régime `due` : `cancelIntent` d'abord ; transaction : verrou `orders`, règle, ateliers, écriture conditionnée, compte fermé, BL, **bon**, **puis** demande | `order-cancellation.service.ts`                                              |
| Exécuteur                 | A3                                                                                                                                                         | `issue-order-refund.handler.ts`                                              |
| Constat                   | A4                                                                                                                                                         | `record-order-refund.handler.ts`                                             |
| Inversion                 | **commande annulée seulement** : demande `refund_reversed` sans échéance, ou génération suivante si c'est son `re_…` ; cloche                              | `reopen-refund-on-reversal.handler.ts`                                       |
| Relancer                  | sous verrou : refuse bail tenu / remboursée / émise ; `next_attempt_at = maintenant`, exécuteur après validation                                           | `retry-order-refund.handler.ts`                                              |
| Facture carte             | pro, payée, retirée, non facturée ; **`Σ succeeded ≥ total ⇒ fully_refunded`** (jamais facturée)                                                           | `accounting/domain/services/card-invoicing.ts`                               |
| Avoir                     | tout `succeeded` sans avoir d'une commande à facture carte, **date du constat indifférente**                                                               | `accounting/application/services/refund-reconciler.ts`                       |

### C. Où chaque invariant est tenu

| Invariant                                           | Base (CHECK/index/`where`)                     | Agrégat                        | Handler seulement                                 | Nulle part         |
| --------------------------------------------------- | ---------------------------------------------- | ------------------------------ | ------------------------------------------------- | ------------------ |
| une intention ↔ une commande                        | `stripe_payment_intent_id @unique`             |                                |                                                   |                    |
| un `re_…` ↔ une ligne du carnet                     | `stripe_refund_id @unique`                     | idempotence                    |                                                   |                    |
| une demande par commande                            | clé primaire `order_id`                        |                                |                                                   |                    |
| un avoir par remboursement                          | déclencheur `order_refund_credit_note_once`    |                                |                                                   |                    |
| montants > 0                                        | CHECK (`order_refund`, `order_refund_request`) | `request()`                    |                                                   |                    |
| `re_…` posé ⇔ `issued_at` posé                      | CHECK `issued_pair`                            |                                |                                                   |                    |
| une annulée ne se rouvre jamais                     | `where status ≠ cancelled` (`markPaid`)        |                                |                                                   |                    |
| les états de paiement ne reculent pas               | `PAID_FROM`, `FAILED_FROM`, `UNSETTLED`        |                                |                                                   |                    |
| **Σ remboursé ≤ encaissé**                          |                                                | `record()` — sur `total_cents` |                                                   |                    |
| un statut de remboursement ne régresse pas          |                                                | `refundTransition`             |                                                   |                    |
| Stripe hors transaction                             |                                                |                                | `assertOutsideTransaction` (garde, mode `report`) |                    |
| un seul exécuteur à la fois                         | bail conditionné (`claim`)                     |                                |                                                   |                    |
| la demande s'écrit sous son bail et sa génération   | `where generation, claim_token` (`save`)       |                                |                                                   |                    |
| une demande partielle ne rend que son montant       |                                                |                                |                                                   | ✗ (pas de montant) |
| une commande encaissée sans ligne chez nous se voit |                                                |                                |                                                   | ✗                  |
| l'encaissé ≠ le total (après révision)              |                                                |                                |                                                   | ✗                  |

### D. La frontière prestataire

**Ports** (le domaine ne voit que ça) : `payments/domain/payment-gateway.ts`
(`createIntent`, `retrieveIntent`, `cancelIntent`, `publishableKey`,
`parseWebhook` → événements réduits `succeeded | failed | refund | link_paid |
link_expired | ignored`), `payments/domain/payment-refunder.ts`
(`refundRemainder`, `findRefund` — **sans montant**),
`payments/domain/ports/checkout-gateway.ts`.

**Adaptateurs Stripe** : `stripe-payment-gateway.ts` (223 l.),
`stripe-intent-translation.ts` (90), `stripe-refund-calls.ts` (166),
`stripe-payment-refunder.ts`, `stripe-checkout-gateway.ts` (81) ; le
contrôleur `payments-webhook.controller.ts` lit l'en-tête `stripe-signature`.
Consommateurs du port hors `payments/` : 9 fichiers d'`orders/` + le module
racine. **Aucun `import Stripe` hors `payments/infrastructure`** (vérifié).

**Ce qui fuit** :

| Fuite                                                                                                                  | Où                                                                                                    | Coût d'un changement                                      |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Payment Element, `clientSecret`, `publishableKey`, `loadStripe`                                                        | boutique `client/commande/reglement-page/`, `stripe-loader.service.ts` ; contrat `OrderPaymentIntent` | la page de paiement entière                               |
| statuts de remboursement = `Refund.status` de Stripe                                                                   | `OrderRefundStatus` (enum DB), `REFUND_STATUSES`, `PaymentRefundStatus`, contrat `OrderRefundView`    | une traduction dans l'adaptateur, ou une migration d'enum |
| noms de colonnes `stripe_payment_intent_id`, `stripe_refund_id` (×2), `stripe_session_id`, `stripe_customer_id`        | `orders.prisma`, `order-refund.prisma`, `payment-links`                                               | cosmétique (renommage = migration)                        |
| métadonnées `lfd_refund_request` / `lfd_generation` / `lfd_order_id` sur les `re_…` ; `paymentLinkId` sur les sessions | `stripe-refund-calls.ts`, `stripe-checkout-gateway.ts`                                                | propre à chaque prestataire — reste dans l'adaptateur     |
| le mot « Stripe » dans les JSDoc, les phrases de refus et les cloches                                                  | ~40 fichiers d'`orders/` et `accounting/` ; `client-copy` (2 textes)                                  | textes                                                    |
| pas de rapprochement                                                                                                   | —                                                                                                     | à construire quel que soit le prestataire                 |

### E. Les angles morts, vérifiés

1. **Paiement réussi sur une intention inconnue : silence.** `markPaid` rend
   `null` (aucune ligne), `ringRefundDue` cherche une commande annulée, n'en
   trouve pas, et rien n'est journalisé ni sonné
   (`confirm-order-payment.handler.ts`). Le remboursement hors commande, lui,
   sonne (A4). Avec des compléments (M2), c'est le cas d'un complément dont la
   ligne n'a pas été écrite.
2. **L'inversion ne vise que l'annulée** : `ReopenRefundOnReversal` sort si
   `subject.status !== "cancelled"`. Un remboursement partiel (M2) inversé sur
   une commande vivante serait perdu, sans cloche.
3. **Remboursement à la main** : admis par construction (`refundRequestStateOf`
   lit « plus rien à rendre » = remboursée, `cancellationRefundSentenceOf` :
   « rien ne partira »). Mais un remboursement manuel **partiel** laisse une
   demande `to_issue`, et l'exécuteur rendra ensuite **tout le reste** — juste
   pour une annulation, faux pour une révision.
4. **`chargedCents = total_cents`** (deux lecteurs). Aucune commande carte
   n'est révisable aujourd'hui (`CardOrderNotRevisableError`), donc le trou est
   fermé par un refus en amont, pas par le carnet.
5. **`settle()` à l'égalité stricte** : `paid → refunded` quand `Σ succeeded
=== total_cents`. Un total révisé à la baisse rendrait une commande
   « remboursée » (donc exclue de la production par `PAYMENTS_REFUSED`) alors
   qu'elle est à livrer.
6. **`fully_refunded` de la facture carte** lit tous les `succeeded`
   (`prisma-card-invoicing.reader.ts`) : une commande baissée de moitié ne
   serait jamais facturée ; `RefundReconciler` émettrait un avoir pour un
   trop-perçu que la facture n'a jamais porté.
7. **Le bail est pris hors transaction, l'appel Stripe part après le commit
   de `prepare()`** : la fenêtre entre les deux existe (assumée par C4.7 pour
   une demande unique ; à revoir avec plusieurs demandes sur une intention).
8. **`PAID_FROM` admet `failed → paid`** sans borne de temps : un pro qui a
   abandonné reste payable jusqu'à la clôture — voulu (Q8 a), et le trou connu
   d'une « épargnée puis refusée » est au `todo-commande-epargnee-a-la-cloture-puis-refusee.md`.
9. **La métadonnée `lfd_order_id` porte `requestId`**, égal à `orderId`
   aujourd'hui — une demande à id propre le rendrait faux.
10. **Aucun balayage ne relit Stripe** : ni les intentions, ni les
    remboursements qu'on n'a pas émis. Le seul regard vers Stripe est
    `findRefund` par métadonnée de notre propre demande.
11. **Les abonnés durables tournent dans la transaction du reçu**
    (`durable-delivery-guard.ts`) et `UnitOfWork.run` **rejoint** la transaction
    ambiante : un refus après écriture, dans un abonné, ne défait rien et
    rejoue. C'est pourquoi l'exécuteur de remboursement part par
    `AfterCommit` — le patron à réutiliser pour toute application d'une
    hausse (M2).
12. **Les e2e couvrent** le cycle d'aujourd'hui (41 suites nommées paiement /
    annulation / remboursement, dont les courses et le balayage) — aucune ne
    couvre un remboursement partiel ni une seconde intention, par construction.

### F. Ce que la forme C exige, point par point

| Besoin M2            | Ce qui change                                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plusieurs paiements  | table `order_payment` (intention unique, montant, statut, rôle) ; `stripe_payment_intent_id` reste le premier ; `loadByPaymentIntent` et `settle()` du webhook apprennent les compléments ; **E1** sonne                                           |
| encaissé ≠ total     | `orders.charged_cents` figé à `markPaid` ; `chargedCents = charged + Σ compléments payés` (**E4**) ; `settle()` compare à l'encaissé (**E5**)                                                                                                      |
| plusieurs demandes   | `order_refund_request` : id propre, `payment_intent_id`, forme `remainder \| amount`, montant ; bail, clé d'idempotence, métadonnées et recherche par id de demande (**E9**) ; index unique partiel `(order_id, intention) WHERE form = remainder` |
| état écrit           | colonne `state` (`to_issue \| issued \| refunded \| stopped \| …`), écrite par l'exécuteur **et par le constat** (qui aujourd'hui ne charge pas la demande) ; `refundRequestStateOf` disparaît ; `stopped` reste relançable                        |
| montant              | `PaymentRefunder.refund(params)` avec `amountCents?` ; `nothing_left` = écart pour une `amount`                                                                                                                                                    |
| carnet               | `order_refund` gagne `payment_intent_id`, `request_id`, `cause` ; reprise de l'existant depuis `orders.stripe_payment_intent_id`                                                                                                                   |
| comptabilité         | `cardInvoiceVerdict` et `RefundReconciler` excluent la cause `revision` (**E6**) ; verdict `blocked` quand encaissé − remboursé ≠ total                                                                                                            |
| inversion            | par le `re_…`, annulée ou vivante (**E2**) ; sans demande sur une vivante : cloche, rien d'écrit                                                                                                                                                   |
| angles morts 1 et 10 | `markPaid` sans ligne ⇒ journal + cloche ; balayage quotidien « intentions et remboursements des commandes carte des 30 derniers jours » + recherche par métadonnée                                                                                |
| prestataire          | `lfd_order_id` distinct de l'id de demande ; statuts de remboursement **traduits** dans l'adaptateur (enum neutre) — à décider : avant ou après M2                                                                                                 |

### G. Ce qui n'a PAS été lu (à faire avant d'écrire le plan)

- `place-shop-order.handler.ts` et `place-order-for-customer.handler.ts`
  au-delà de l'appel à `createIntent` (lignes 311 et 180) ;
- `prisma-order-revision.repository.ts` en entier (seule la condition de
  `save` a été lue : `revision = from`, `status ∈ REVISABLE_STATUSES`) ;
- le module `loyalty` (hors cœur, lot C-2b) ;
- la purge du scénario de dev et les semis qui suppriment des remboursements
  (`vitruve` les a cités, non ouverts ici) ;
- les 35 lecteurs de `paymentStatus` dans les deux fronts et `b2b-ui` : comptés, non lus.
