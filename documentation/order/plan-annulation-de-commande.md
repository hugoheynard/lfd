# Plan — annuler une commande

**Statut** : 📐 plan, 2026-09-17, **révisé le 2026-10-12** — le lot C3
(annulation par le staff, sans remboursement, sans le compte) est écrit en tête,
sur les décisions de Hugo du jour, dont l'option (a) : la carte non payée
s'annule en fermant l'intention chez Stripe. Attend `vitruve`. Le reste du
document (§1 à §9) est l'état du 2026-09-17, et le §1 est en partie périmé
(C3.1). **Rien n'est bâti.** Touche **l'argent**
(annulation d'une intention Stripe, remboursement). 🔴 **Contredit par
`vitruve` le même jour : 4 BLOQUANT, 7 SÉRIEUX.** Les décisions D1, D2, D3, D5
et D6 ne tiennent pas en l'état — le §9 dit pourquoi et dans quelle direction
les reprendre. **Ne pas bâtir avant la refonte** — l'état et les décisions attendues sont
suivis dans [`todo-annulation-de-commande.md`](todo-annulation-de-commande.md).
**Portée** : la transition `placed → cancelled`, ce qu'elle fait de l'argent, et
ce qu'elle dit au client. Ni l'avenant (modifier une commande), ni l'annulation
d'une commande déjà dans le plan.

## 0. La demande

> « c'est vrai que `cancelled` n'existe pas, on devrait peut-être le faire,
> règle : tant qu'on n'est pas `confirmed` on peut cancel » — Hugo, 2026-09-17.
>
> « envoi d'un mail de confirmation d'annulation, n'ira pas dans le plan de prod
> du jour » — Hugo, même jour.

## Lot C3 — annulation par le staff (2026-10-12)

> 🔨 **Côté serveur bâti le 2026-10-12, non commité** (`apps/lfd-api` +
> `packages/contracts`) : migrations `20261012700000_le_droit_d_annuler_une_commande`
> et `20261012700100_l_annulation_de_commande`, `POST /admin/orders/:id/cancel`,
> `cancellability` sur `GET /admin/orders/:id`, retrait au fournil
> (`OrderWithdrawalDesk`, `production.order_withdrawal`), agrégat
> `ProductionDay.close/retake` qui écarte les retraits, fait durable
> `order.cancelled` (journal + courriel `customer.order-cancelled`), S1
> (`markFulfilled` conditionné), e2e `order-staff-cancel*.e2e-spec.ts`.
> **Reste** : l'écran (lot back-office), et la phrase `order.cancelled` du
> journal côté back-office (`phrase-registry.ts` ne compile plus sans elle).
> **Écarts au plan, à trancher** : (1) un total nul qui porte un bon est
> REFUSÉ (`orders.cancel.voucher_settled`) — son reliquat est soldé dès la
> passation (`PlaceOrderHandler.persist`), rendre le bon doublerait sa valeur ;
> la décision 8 ne tient donc pas telle quelle pour `free` — **Hugo,
> 2026-10-12 : « garde le refus pour l'instant »** ; (2) la phrase du
> 500 « transaction non enregistrée » ne sort pas : `AppErrorFilter` masque le
> message d'une `TechnicalError`, seul le code `orders.cancel.not_recorded`
> sort — l'écran doit dire la phrase d'après le code ; (3) `confirmed` et
> `in_production`, absents de C3.3, sont refusés comme « inscrite » ; (4) le
> détail lit l'inscription par un second port du fournil,
> `OrderInscriptionReader` (le plan ne nommait que le guichet).
>
> 📐 **Plan.** Réduit le même jour sur les décisions de Hugo
> (C3.0) et les objections de `vitruve` (C3.9), puis **élargi** le même jour
> par l'option (a) de Hugo : l'annulation ferme l'intention chez Stripe pour
> une carte non payée (C3.2, C3.4 bis). Le remboursement vient juste après
> (Lot C4).
> Numérotation : celle de [`plan-page-commandes.md`](plan-page-commandes.md)
> (C1 liste, C2 écran).

### C3.0 Les décisions de Hugo (2026-10-12)

> « on doit pouvoir annuler une commande tant qu'elle n'est pas ajoutée au
> compte à produire »
>
> « commençons par le faire en staff »

1. **Le critère** est B1 (§9.3, point 1) : **le fournil ne l'a pas inscrite**,
   et non plus le statut `placed`.
2. **Le staff d'abord** : un bouton dans `/commandes/:orderId`, une route
   admin. Le client vient après ; S2 (« qui, dans une société ») est reporté.
3. **Les commandes au compte : plus tard.** Ce lot ne vise que les commandes
   réglées par carte (boutique ou pro carte) non payées ; une commande au
   compte est **refusée** avec une phrase qui nomme le cas.
4. **Paiement carte en cours : refusé** — `pending`, et `failed` dont
   l'intention reste vivante.
5. **Payée par carte : refusée jusqu'à C4** ; l'équipe rembourse dans Stripe
   si besoin.
6. **Une permission à part** pour annuler : une ressource `StaffResource`
   neuve, ajoutée par migration, **accordée à l'écran**.
7. **Option (a), tranchée plus tard le même jour** : l'annulation staff
   **ferme l'intention de paiement chez Stripe** pour une commande carte non
   payée (`pending` ou `failed`), comme `AbandonOrderHandler` le fait déjà —
   **sans remboursement**. Elle **remplace la décision 4** : une carte en
   cours ne se refuse plus d'office, elle se ferme. C4 (le remboursement)
   suit juste après, en lot à part : « je pense que souvent l'annulation aura
   lieu post paiement » (Hugo).
8. **Le total nul (`free`) reste annulable, et le bon utilisé est rendu** :
   « si un bon a été utilisé remboursement du bon » (Hugo, même jour).

### C3.1 L'existant qui a bougé depuis le §1 (ouvert le 2026-10-12)

Le §1 date du 2026-09-17 ; plusieurs de ses phrases sont **fausses** aujourd'hui.

- **`cancelled` s'écrit déjà, par trois chemins** : l'abandon de carte d'un
  particulier (`PrismaOrderRepository.markAbandoned`), l'expiration des
  impayés de la boutique (`UnsettledShopOrderExpiryService`, 30 min) et
  l'échec à l'arrêt (`failAtClosing`, par `PendingSettlementSweeper` au début
  de chaque clôture). Les trois écrivent `cancelled` + `failed` sous
  `status = placed`, et les deux premiers **annulent l'intention chez Stripe
  d'abord**.
- **Le webhook ne rouvre plus une annulée** : `settle()` porte
  `status <> cancelled` (2026-09-26) ; un encaissement tardif publie
  `OrderPaidAfterCancellationEvent`, que `RingRefundDue` écoute en durable
  (2026-10-10) pour sonner « à rembourser ».
- **`GET /orders/:id/payment` refuse une annulée**.
- **Le bon de fidélité** engagé est libéré dans la transaction de
  `markAbandoned`.
- **`markFulfilled` n'a toujours aucune condition de statut** (S1).
- **Le JSDoc du contrôleur admin dit l'inverse de ce lot** (« l'annuler [est
  une décision] de production, pas [un bouton] d'écran ») : à réécrire dans le
  même commit.

### C3.2 Ce qui est annulable — vérifié dans le code

Le régime de règlement est une déduction figée à la passation
(`settlementRegimeOf`, `b2b/orders/domain/services/settlement-regime.ts`) :
`account` (`not_required`, total > 0), `free` (`not_required`, total nul),
`due` (`pending` ou `failed`), `paid` (`paid`, `refunded`).

**`failed` veut toujours dire « intention vivante »** (lu le 2026-10-12) :

- `PAID_FROM = [pending, failed]` : un encaissement l'emporte sur un refus
  antérieur — l'intention d'un `failed` est **payable** par construction ;
- le webhook d'échec (`markPaymentFailed`) laisse l'intention chez Stripe en
  `requires_payment_method`, réessayable ;
- l'abandon d'un **pro** écrit `failed` et laisse l'intention vivante
  exprès (Q8 du plan d'abandon, 2026-09-26) ;
- les seuls chemins qui **tuent** l'intention (abandon d'un particulier,
  expiration de la boutique) écrivent en même temps `cancelled` : il n'existe
  aucune commande `placed` + `failed` dont l'intention soit morte.

| Régime    | Décision                             | Annulable ?                                              |
| --------- | ------------------------------------ | -------------------------------------------------------- |
| `account` | plus tard (C3.0, 3)                  | non                                                      |
| `due`     | **intention fermée chez Stripe (7)** | **oui**, si Stripe confirme qu'elle est morte (C3.4 bis) |
| `paid`    | refusée jusqu'à C4 (5)               | non                                                      |
| `free`    | —                                    | oui, si non inscrite au fournil                          |

Sans la décision 7, le lot ne rendait annulable que le total nul : c'est ce
constat qui a fait trancher (a).

**Une commande `due` n'est jamais inscrite au fournil** (lu le 2026-10-12) :
`planWhere()` (`b2b/orders/infrastructure/plan-filter.ts:47`) exclut les
règlements refusés et en attente (`settlementWhere`, `:64`). Elle n'y entre
qu'en devenant `paid` — ce que la fermeture de l'intention interdit. Le
retrait au fournil (C3.4) reste écrit pour elle, uniformément, mais ne peut
pas y rendre `inscribed`.

### C3.3 Le critère, et où il se lit

| #   | Refus, dans cet ordre                            | Où il se lit                                                             |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| 1   | déjà `cancelled`                                 | `orders.status`                                                          |
| 2   | `draft`, `ready`, `fulfilled`                    | `orders.status`                                                          |
| 3   | au compte                                        | `settlementRegimeOf` = `account`                                         |
| 4   | payée                                            | régime `paid`                                                            |
| 5   | **inscrite par le fournil**                      | ligne `production.production_order (service_day, order_id)`, par un port |
| 6   | `due` : Stripe ne confirme pas l'intention morte | issue de `cancelIntent` (C3.4 bis)                                       |

Le statut seul ne suffit pas (B1, confirmé ce jour) : la clôture enregistre
l'instantané puis le commerce passe `confirmed` dans un abonné durable ;
entre les deux, ou pour toujours si l'abonné tombe, une inscrite reste
`placed`. Le retirage inscrit des `placed` sans rien publier au commerce.

### C3.4 La course avec la clôture et le retirage

**Prendre le verrou de journée ne suffit pas** : clôture et retirage lisent
`DayOrdersReader.producibleFor` **avant** `ProductionDayLock`. Séquence
perdante : la clôture lit O ; l'annulation verrouille, voit O non inscrite,
annule, valide ; la clôture verrouille et inscrit O.

**La forme retenue** :

- `production/channels/commerce/` gagne un port **déclaré et implémenté par
  le fournil**, `OrderWithdrawalDesk.withdraw(day, orderId): "withdrawn" |
"inscribed"`, exécuté **dans l'unité de travail de l'appelant**
  (précédent : `BinDesk`). Il prend `ProductionDayLock.lock(day)`, lit
  `production_order`, et sinon écrit `production.order_withdrawal
(service_day, order_id, at)` — table neuve, migration additive.
- 🔴 **La règle d'écartement vit dans l'agrégat du fournil, pas dans les
  handlers** (`vitruve`) : `ProductionDay.close(producible, withdrawn, …)` et
  `ProductionDay.retake(producible, withdrawn, …)` **reçoivent** les retraits
  et les écartent eux-mêmes. Les handlers les chargent **sous le verrou**,
  après le rechargement de la journée et avant l'appel à l'agrégat :
  avant `current.close(...)` (`close-production-day.handler.ts:180`) et avant
  `locked.retake(...)` (`retake-production-day.handler.ts:109`). Lecture de
  LEURS tables : permise sous verrou.
- **Les autres lecteurs de `producibleFor` ne sont pas sous verrou et n'en
  ont pas besoin** — ils disent, ils n'inscrivent pas : l'alerte de
  l'arrêt automatique (`run-auto-close-round.handler.ts:101` et `:144`) et
  la fiche (`production-worksheet-reading.service.ts:63`). Une annulée y
  disparaît d'elle-même : `producibleFor` lit `planWhere()` (`status =
placed`). Pas de retrait à leur faire lire.
- **Puis**, dans la même transaction, côté commerce : `updateMany where { id,
status: placed, OR: [{ paymentStatus in (pending, failed) }, {
paymentStatus: not_required, totalCents: 0 }] }` → `cancelled` ; un `due`
  passe aussi `paymentStatus = failed`, comme `markAbandoned`. `0` ligne →
  relire, rendre le refus exact, **et annuler toute la transaction**, retrait
  du fournil compris.
- Ordre des verrous : ligne `orders` **puis** journée — celui de C3.4 ter,
  qui fait foi.

Écriture nue justifiée (CLAUDE.md §3.1), comme `absorbIntoPlan`. La phrase de
refus reste une règle pure, `cancellationBlocker(state)`, sur le modèle de
`packingBlocker`.

**MINEURS de `vitruve`, assumés et dits** :

- **le balayage tourne avant le verrou** (`settlements.sweep(day)`, première
  ligne de la clôture) : il peut annuler une commande `due` pendant qu'on
  l'annule. `status = placed` dans les deux `where` ne laisse franchir qu'un
  des deux ; si le balayage gagne, l'annulation staff relit et rend « déjà
  annulée » (l'intention est morte des deux côtés) ;
- **`ProductionDayRetakenEvent` est écouté par la livraison** (CA6b) : il
  porte les `orderIds` absorbés ; une commande retirée n'est pas absorbée,
  donc n'y figure pas — rien à changer, à éprouver en e2e ;
- **une journée close ne recalcule pas** (la réannonce republie
  l'instantané) : une commande retirée après l'arrêt n'y était pas, la
  réannonce ne l'y fait pas entrer.

### C3.4 bis L'ordre des gestes avec Stripe (décision 7)

**Stripe d'abord, la transaction ensuite** — l'ordre de l'abandon. Ce qui en
est repris, lu le 2026-10-12 :

| Repris                                                                                                                                   | D'où                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| l'appel `cancelIntent` sur l'intention de la commande, **hors transaction**                                                              | `orders/application/commands/abandon-order.handler.ts:94-97`                                                                                         |
| les cinq issues et leur sort : `cancelled` / `already_cancelled` laissent écrire ; `already_paid`, `in_progress`, `unavailable` refusent | `abandon-order.handler.ts:150-163` (`ensureIntentDead`) ; `payments/domain/payment-gateway.ts:50`                                                    |
| le port ne lève jamais ; un refus d'annuler relit l'intention pour dire pourquoi                                                         | `payments/infrastructure/stripe-payment-gateway.ts:81-104`                                                                                           |
| l'écriture, le bon libéré et le fait durable dans UNE unité de travail                                                                   | `abandon-order.handler.ts:119-133`                                                                                                                   |
| les erreurs `OrderPaymentAlreadyReceivedError`, `OrderPaymentInProgressError`, `OrderAbandonUnavailableError`                            | `orders/domain/errors/order-abandon-errors.ts` — reprises pour leur **sens** ; leurs phrases parlent au client, celles du staff sont à écrire (C3.7) |

**Ce qui n'est PAS repris** :

- la condition « seul un particulier touche Stripe »
  (`abandon-order.handler.ts:94`, `owned.clientele === "public"`) : l'abandon
  garde l'intention d'un pro vivante pour qu'il puisse repayer ; une
  **annulation** la ferme pour toutes les clientèles — c'est la décision 7 ;
- le mur client (`ensureOrderVisible`, `ensureOrderAuthor`) : la route est
  staff ;
- `markAbandoned` : sa branche pro n'écrit que `failed` ; l'annulation a sa
  propre écriture (C3.4).

**Pourquoi Stripe AVANT la transaction** : pas d'appel réseau sous le verrou
de journée ; et annuler chez nous puis échouer chez Stripe laisserait une
**annulée payable** — ce que l'abandon refuse déjà.

**La séquence** :

1. lire la commande ; `cancellationBlocker` (statut, compte, `paid`) — refus
   immédiats, aucun appel ;
2. si `due` et une intention existe : `cancelIntent` —
   `cancelled` / `already_cancelled` → continuer ; `already_paid` → refus
   « payée par carte » ; `in_progress` → refus « en cours de traitement » ;
   `unavailable` → refus « Stripe ne répond pas », journalisé en `warn`.
   Dans les trois refus, l'appel à Stripe n'a rien fermé et la base n'est
   pas touchée ;
3. la transaction de C3.4, dans l'ordre exact de C3.4 ter (ligne `orders`
   verrouillée et relue, retrait au fournil, `updateMany`, bon, fait durable).

**La course webhook `paid` contre l'annulation** :

- **encaissé avant l'appel** : Stripe refuse d'annuler une intention réussie,
  le port relit et rend `already_paid` → refus. Le webhook en vol passe la
  commande `paid` normalement : payée, non annulée, cohérent ;
- **encaissé après l'appel** : impossible, une intention annulée ne
  s'encaisse plus ;
- **`processing`** : `in_progress`, refus — on ne ferme pas ce qui peut
  encore aboutir.

**Les trous, et qui les tient** :

- **Stripe a fermé, puis notre transaction échoue** : voir C3.4 ter
  (rejeu dans la requête, puis erreur technique, puis risque résiduel
  assumé).
- **Un `paid` tardif sur une annulée** ne peut plus venir d'une intention
  fermée ; s'il venait d'ailleurs, `settle()` refuse de rouvrir une annulée et
  `RingRefundDue` sonne (C3.1).

### C3.4 ter Double clic, et transaction qui échoue après Stripe (`vitruve`, 2ᵉ et 3ᵉ passages, 2026-10-12)

**À quoi sert `production.order_withdrawal` en C3** : au **seul régime
`free`**. Une `due` n'est jamais inscrite au fournil (`plan-filter.ts:47`,
`:64`), le retrait ne peut rien lui refuser ; il est écrit pour elle aussi,
uniformément, parce qu'une seule écriture coûte moins que deux chemins. La
table servira pleinement au lot « au compte » (C3.9).

**Sa clé** : `order_id` en **clé primaire** (une commande n'a qu'un jour de
service), plus `service_day` et `withdrawn_at`. `withdraw` est **idempotent** :
`INSERT … ON CONFLICT (order_id) DO NOTHING`, issue `withdrawn` dans les deux
cas — un retrait déjà posé n'est pas une erreur.

**Deux clics, deux staffs** — la transaction, dans cet ordre :

1. `SELECT … FROM orders WHERE id = $1 FOR UPDATE` puis relire le statut :
   `cancelled` → refus « déjà annulée » (409), sans écriture. Le
   second clic attend le premier sur cette ligne, puis voit `cancelled`.
2. `OrderWithdrawalDesk.withdraw` : verrou de journée, `production_order`,
   insertion idempotente.
3. `updateMany` conditionné (C3.4) ; `count === 1` seulement libère le bon
   (comme `abandon-order.handler.ts:124-126`) et publie le fait.

Ordre des verrous : ligne `orders` **puis** journée. La clôture prend la
journée sans toucher `orders` ; son abonné `absorbIntoPlan` touche `orders`
sans la journée. Aucun preneur ne tient la journée en attendant `orders` :
pas de cycle.

**L'unité de travail imbriquée** (lu dans `platform/database/unit-of-work.ts:50`) :
déjà dans une transaction, `run` **rejoint** celle en cours, et les rappels
d'après validation s'accrochent à la plus externe. Le port du fournil appelé
dans la transaction du commerce y écrit donc pour de bon, et tout s'annule
ensemble.

**La transaction échoue après la fermeture chez Stripe.** Pas de marque
locale : une première version écrivait une « demande d'annulation » avant
Stripe ; le 3ᵉ passage de `vitruve` l'a cassée (marque survivant à un
`paid` par webhook, expiration boutique oubliée, effacement non nommé selon
l'issue, deux demandes concurrentes). Décision du 2026-10-12 :

1. `cancelled_by`, `cancellation_reason` et `cancelled_at` ne s'écrivent
   **que dans la transaction finale**, avec le statut.
2. Si cette transaction échoue après une fermeture réussie chez Stripe, le
   handler la **rejoue une fois** dans la même requête (la relecture sous
   `FOR UPDATE` de l'étape 1 rend le rejeu sûr).
3. Si elle échoue encore : `TechnicalError` (500) dont la phrase dit au
   staff « Le paiement est fermé chez Stripe, mais l'annulation n'a pas pu
   être enregistrée. Relancez l'annulation. » Le rejeu du staff obtient
   `already_cancelled` de Stripe et écrit.
4. **Risque résiduel, assumé** : si personne ne relance, la commande reste
   `placed` + `due` avec une intention morte. Elle n'est jamais producible
   (`planWhere`) ; la page de règlement refuse une intention morte ; la
   clôture (`failAtClosing`) ou l'expiration des impayés boutique
   (`UnsettledShopOrderExpiryService`) finit par l'annuler comme
   **« paiement non abouti »** — mauvais courriel, aucun auteur ni motif. Rare
   (deux échecs de base de suite dans la même requête), et **aucun argent en
   jeu** : rien n'a été encaissé. Le balayage n'est pas modifié.

**Le webhook d'échec tardif sur une annulée** : `markPaymentFailed` passe par
`settle()`, dont le `where` porte `status <> cancelled`
(`prisma-order.repository.ts:248`) — il n'écrit rien et ne publie rien (lu le
2026-10-12).

**Une commande n'a qu'une intention** (vérifié le 2026-10-12, à garder vrai
en C4) : `createIntent` n'est appelé qu'à la passation —
`place-shop-order.handler.ts:245`, `place-order-for-customer.handler.ts:136`
et `order-settlement.ts:50` (`settleOrder`, appelé par
`place-order.handler.ts` et `place-order-for-customer.handler.ts`). La
consigne transmise n'en nommait que deux ; aucun des trois ne crée une
seconde intention pour une commande existante. Fermer
`stripePaymentIntentId` ferme donc tout ce qui peut encaisser.

**Les issues Stripe, complétées** : `requires_capture` ne se présente pas
chez nous (capture automatique, `stripe-intent-translation.ts:15`) ; s'il
apparaissait, l'argent n'est pas pris et Stripe accepte d'annuler : issue
`cancelled`. **Une `due` sans intention** (`stripePaymentIntentId` nul) :
aucun appel, la transaction écrit directement.

### C3.5 Ce que devient la commande

- **`status = cancelled`**, règlement inchangé.
- **Colonnes neuves, additives et nullables** : `cancelled_at`,
  `cancelled_by`, `cancellation_reason` — tous écrits dans la seule
  transaction finale (C3.4 ter). 🔴 **`cancelled_by` est l'id staff
  interne** (le `staffUserId` que le contrôleur reçoit par `@StaffUserId()`),
  **jamais un `sub`** — `lint:auth0-id-readers` et `lint:subject-readers`
  tiennent la liste de ses lecteurs, une colonne neuve n'y entre pas. Les
  trois annulations automatiques laissent ces colonnes vides ; on ne rattrape
  rien.
- **Motif obligatoire**, borné, jamais montré au client.
- **Le bon de fidélité utilisé est rendu** (Hugo, 2026-10-12 : « si un bon a
  été utilisé remboursement du bon ») dans la même transaction, **seulement
  si l'`updateMany` rend `count === 1`** (`LoyaltyVoucherRedemption.release`,
  comme l'abandon) — un rejeu ne le rend pas deux fois. Vaut pour `free`
  (c'est souvent lui qui a fait le total nul) comme pour `due`.
- **Le fait `OrderCancelledEvent`, durable**, écrit dans l'unité de travail.
  Abonnés :
  - **le journal** `order.cancelled` (D10) : sujet = le client, charge = qui
    (id staff), motif, régime ; idempotent par commande ; visible dans
    l'historique du détail ;
  - **la croissance** soustrait (S5), à côté de `OnOrderAbandoned` ;
  - **le courriel** (D9) : « votre commande X pour le jour J a été annulée
    par notre équipe », sans QR ni motif ; `free` : « Rien ne vous sera
    facturé pour cette commande. » ; `due` : « Aucun paiement n'a été
    prélevé. » ; **si un bon a été utilisé** : « Votre bon de fidélité vous
    est rendu : vous pourrez l'utiliser sur une prochaine commande. » ; clé `order.cancelled:<orderId>` ;
    gabarit fr, en, it, distinct de celui de l'abandon.
- **Répétition** : refus nommé « déjà annulée », rien n'est republié.

### C3.6 Effets sur les autres blocs

| Bloc        | Effet                                                                                                                                                                                                                                                                                                                                                                  | Vérifié le 2026-10-12                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| fournil     | une ligne `order_withdrawal`, écartée par l'agrégat à la clôture et au retirage                                                                                                                                                                                                                                                                                        | `production_order` unique `(service_day, order_id)` |
| colisage    | aucun : la liste naît de l'instantané (`packing_list_drawn`)                                                                                                                                                                                                                                                                                                           | publié par clôture et retirage seulement            |
| livraison   | `LocateOnOrderPlaced` géocode l'adresse à la passation, rien de plus : un point de carnet et de cache, pas un arrêt. Le prévisionnel et le départ relisent le statut (`prisma-delivery-order-states.reader.ts`, `prisma-delivery-orders.reader.ts` marquent `cancelled`). **Décision : ne rien défaire** — l'adresse géocodée reste valable pour la prochaine commande | handler et lecteurs ouverts                         |
| retrait     | `markFulfilled` gagne `status <> cancelled` (S1)                                                                                                                                                                                                                                                                                                                       | sans condition ce jour                              |
| facturation | aucun dans ce lot : le compte est refusé                                                                                                                                                                                                                                                                                                                               | —                                                   |

### C3.7 Les refus nommés

| Cas                    | Phrase (`BusinessError`, 409)                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| déjà annulée           | « Cette commande est déjà annulée (le JJ/MM à HH:mm). »                                                                                                     |
| au compte              | « Cette commande est passée au compte de la société. L'annulation des commandes au compte n'existe pas encore : voyez avec la comptabilité. »               |
| payée par carte        | « Cette commande a été payée par carte en ligne. L'annulation avec remboursement n'existe pas encore : remboursez depuis Stripe, puis prévenez le client. » |
| paiement en traitement | « Un paiement par carte est en cours de traitement sur cette commande. Réessayez dans quelques minutes : s'il aboutit, la commande sera payée. »            |
| Stripe injoignable     | « Le prestataire de paiement ne répond pas : rien n'a été annulé. Réessayez dans un instant. »                                                              |
| inscrite au fournil    | « Le fournil a déjà inscrit cette commande au compte à produire du JJ/MM : elle sera fabriquée. Voyez avec le fournil. »                                    |
| prête / retirée        | « Cette commande est déjà prête » / « déjà retirée ».                                                                                                       |
| motif vide             | `DomainError` (400) « Indiquez pourquoi la commande est annulée. »                                                                                          |

La commande refusée reste **non annulée** : aucun état « annulée + payée »
fabriqué à la main.

### C3.8 La route, le droit, l'écran, les tests

**La route** : `POST /admin/orders/:id/cancel`, corps `{ reason }` (Zod),
`204`. `CancelOrderCommand` + handler séparés. `GET /admin/orders/:id` gagne
`cancellability: { cancellable: true } | { cancellable: false, reason }`,
calculée par la même `cancellationBlocker` (sans verrou : un affichage).

**Le droit** : ressource neuve **`b2b_cancel_order`**, action `write`. Le
nommage suit le seul précédent de geste commerce, `b2b_place_order` (« sorti
de `b2b_orders` », `prisma/schema/public/staff.prisma`, lu le 2026-10-12) :
`b2b_<verbe>_<objet>`. La migration n'ajoute que la valeur à l'énuméré, sa
ligne de libellé (`STAFF_RESOURCE_LABELS`) suit dans le code ; **aucune ligne
dans `staff_role_definitions` ni `staff_permission_overrides`**
(`lint:no-role-grants-in-migrations`) — Hugo l'accorde à
`/admin/staff-roles`. `ROLE_GRANTS` (graine dev/e2e) peut la porter. La
route : `@RequirePermission("b2b_cancel_order:write")`, comme le `POST` de
passation.

**L'écran** (`/commandes/:orderId`) : bouton « Annuler la commande » (fold,
destructif) visible avec le droit ; confirmation **en ligne** (motif
obligatoire, phrase que le client recevra, « Confirmer l'annulation » /
« Garder la commande ») ; **désactivé avec la raison du serveur** sinon ;
relecture après succès.

**Les tests** :

- domaine : `cancellationBlocker` par statut × régime × inscrite ;
  `ProductionDay.close` / `retake` écartent un retrait (agrégat, sans double) ;
- application : retrait du fournil puis écriture ; `inscribed` n'écrit rien ;
  `0` ligne annule tout ; bon libéré ; fait durable publié une fois ;
- e2e : **la course** (clôture lancée, lecture d'avant-verrou faite,
  annulation validée → absente de `production_order`), même chose au
  retirage, et `ProductionDayRetakenEvent` sans l'annulée ; inscrite mais
  `placed` → refus ; au compte, `paid` → refus nommés ; `pending` et
  `failed`, pro et particulier → annulées, intention fermée sur le double
  du prestataire ; les cinq issues de `cancelIntent` ; Stripe ferme puis la
  **transaction rejouée après fermeture Stripe** (premier essai en échec
  forcé → le rejeu dans la requête écrit ; deux échecs → 500 avec la phrase,
  puis un second appel staff obtient `already_cancelled` et écrit) ; **double clic** et **deux staffs** simultanés → une annulation,
  un courriel, l'autre « déjà annulée » (409, jamais 500) ; `withdraw` deux
  fois → une ligne ; bon rendu une fois ; `due` sans intention → annulée
  sans appel ; webhook d'échec tardif sur une annulée → rien ;
  deux annulations concurrentes → un seul courriel ; `markFulfilled` sur une
  annulée → `false` ; sans `b2b_cancel_order:write` → 403 ;
- front : bouton absent sans droit, désactivé avec raison, motif obligatoire.

### C3.9 Prérequis du lot « au compte », à venir

Sortis de C3 (décision 3), à reprendre avant d'ouvrir le compte — avec le
blocage de `vitruve` :

- **une commande au compte se facture et se prélève avant d'être produite** :
  l'assiette se borne par `created_at` (`billableOrderWhere`), pas par le jour
  de production ;
- **le refus « facturée / dans un lot » ne se lit pas où le plan le cherchait** :
  l'appartenance d'une commande à un lot est dans `order_collection`, pas dans
  `collection_batch_line` ;
- **un verrou partagé avec la facturation est nécessaire** : l'émission des
  factures mensuelles (`issue-monthly-invoices.handler.ts:137`, `:143`,
  `:235`) et la constitution des lots (`constitute-collection-batches.handler.ts:108`,
  `:111`) lisent l'assiette puis écrivent ; une annulation entre les deux
  ferait facturer ou prélever une annulée. Le dépôt la refuse déjà
  (`CancelledOrdersReader`), l'émission non.

→ Repris et conçu en **Lot C5** (2026-10-12).

### C3.10 Sort des objections de `vitruve` (§9) pour ce lot

| #   | Sort                         | Comment                                                                                                                                                         |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **réglée**                   | critère « non inscrite », retraits écartés par l'agrégat sous le verrou (C3.4)                                                                                  |
| B2  | **réglée pour la fermeture** | Stripe AVANT l'écriture : un échec Stripe n'écrit rien ; le trou inverse est celui de l'abandon, tenu par ses filets (C3.4 bis). Le remboursement revient en C4 |
| B3  | contournée                   | pas de filet à construire ; `RingRefundDue` existe                                                                                                              |
| B4  | **réglée**                   | « déjà payée » : `already_paid` refuse sans rien écrire ; aucun remboursement, donc pas de double                                                               |
| S1  | **réglée**                   | `markFulfilled` conditionné, test de régression                                                                                                                 |
| S2  | reportée                     | lot client                                                                                                                                                      |
| S3  | reportée                     | C4                                                                                                                                                              |
| S4  | reportée                     | l'expiration existe déjà (C3.1)                                                                                                                                 |
| S5  | partielle                    | croissance soustraite ; le déjà-prélevé passe au lot « au compte » (C3.9)                                                                                       |
| S6  | assumée                      | l'invité passe par la demande ; l'équipe annule                                                                                                                 |
| S7  | sans objet                   | aucune valeur ajoutée à `OrderStatus` / `PaymentStatus` ; `StaffResource` gagne `b2b_cancel_order`                                                              |

**Plus de question ouverte pour Hugo** : (a) tranché le 2026-10-12. Reste
le passage à `vitruve` (argent, frontière `b2b → production`).

### Lot C3b — la refusion du bon (conçu le 2026-10-12, à contredire)

> Hugo, 2026-10-12 : « le choix deux était pas mieux […] ça permet de
> réconcilier le bon en cas d'annulation », « comme un remerge de bon », « il
> faudra que ça soit spécifié en admin si la manip est faite par un staff,
> expliquer la réconciliation du bon ».

> 🔨 **Bâti le 2026-10-12, non commité** (`apps/lfd-api`, `packages/contracts`,
> journal et confirmation d'annulation du back-office) : migrations
> `20261012800000_le_reliquat_refondu` et `20261012800100_la_refusion_du_bon` ;
> prérequis (expiration de nuit sous verrou et relue, `save` conditionné au
> statut chargé, relecture de la commande dans `settleRemainder`) ;
> `voucherRestitutionOf`, `LoyaltyVoucher.reinstate/mergeBackInto/lapse`,
> `release` resserré ; `LoyaltyVoucherRedemption.reinstate` et le port de
> lecture `VoucherRestitutionPreview` ; refus `voucher_remainder_engaged` /
> `voucher_remainder_cancelled` ; fait `loyalty.voucher_reinstated` ;
> `voucher` remplace `voucherReturned` ; `cancellability.voucher` ; e2e
> `order-staff-cancel-voucher.e2e-spec.ts` et
> `order-staff-cancel-voucher-races.e2e-spec.ts`. **Écarts au bâti** : (1) l'aperçu
> est implémenté par une classe à part, `LoyaltyVoucherRestitutionPreviewing`,
> et rend le même type `VoucherRestitution` (le plan donnait au port et à son
> type le même nom) ; (2) la relecture de `settleRemainder` vérifie que la
> commande relue est celle du lot et que son règlement n'est pas en suspens
> (`pending`/`failed`) — exiger `paid` aurait bloqué le solde à la passation
> d'un total nul (`not_required`) ; (3) `reinstate` reçoit « engagé ailleurs »
> en entrée, lu par le service au port `VoucherOrderReader` ; (4) l'écran des
> bons du staff affiche `merged_back` comme « Refondu dans le bon d'origine »,
> sans nommer le parent ; (5) l'annulation HTTP d'un reliquat par le staff
> tombe en 500 (recrédit de 0 point refusé par `loyalty_ledger_entries_kind_shape`)
> — le cas 6 n'est produit en e2e que par l'agrégat, hors de ce lot.

📐 **Plan.** Touche **l'argent** et porte une
**migration**. Contredit par `vitruve` le 2026-10-12 (2 BLOQUANT, 5 SÉRIEUX,
2 mineurs, tous intégrés ci-dessous — C3b.11) ; Q1 à Q3 tranchées par Hugo le
même jour. `lecteur-de-migrations` au bâti. Lève le refus
`orders.cancel.voucher_settled`, et **remplace** le `release` nu de
`CancelOrderHandler.afterCancelled` par une restitution qui sait qu'un bon
peut avoir laissé un reliquat.

#### C3b.1 Ce que le code dit — ouvert le 2026-10-12

**Quand un reliquat naît.** Deux chemins, et deux seulement :

- **à la passation**, dans la même transaction, quand la commande n'a pas
  d'intention Stripe (`PlaceOrderHandler.persist`, `intent === null` →
  `vouchers.settleRemainder`) : c'est le total nul (`free`) **et** le compte
  (`account`, refusé par C3) ;
- **au passage de nuit** (`SettleVoucherRemaindersHandler`), pour une commande
  vivante dont le règlement est **`paid`** — rien d'autre. Aucun webhook
  n'émet de reliquat.

La boutique n'engage aucun bon (`place-shop-order.handler.ts` n'en cite pas).
« Soldé » est la marque `remainder_settled_at` ; le bon d'origine reste
**`reserved`** pour toujours après (aucun état `used`, `loyalty-voucher-shapes.ts`).
Trois issues : `none` (imputé en entier, pas d'enfant), `issued` (un enfant,
même titulaire, **même date limite**, 0 point), `lapsed` (le parent était échu
au solde : rien n'est émis, fait `loyalty.voucher_remainder_lapsed`).

**Ce que C3 rencontre donc, régime par régime :**

| Régime annulable      | Bon à l'annulation                                        | Aujourd'hui (C3)            |
| --------------------- | --------------------------------------------------------- | --------------------------- |
| `free`                | **toujours soldé** (`none`, `issued` ou `lapsed`)         | refus `voucher_settled`     |
| `due`                 | **jamais soldé** — le passage de nuit n'attend que `paid` | `release` (rendu ou expiré) |
| `paid` (C4)           | soldé **ou non**, selon que la nuit est passée            | refusé                      |
| `account` (plus tard) | toujours soldé, comme `free`                              | refusé                      |

La carte non payée dont le bon a été engagé n'a **jamais** de reliquat : elle
garde le chemin `release`. C3b vise `free` aujourd'hui, et pose le mécanisme
que C4 et le compte réutiliseront tel quel.

**Cinq faits qui contraignent la conception** (tous lus le 2026-10-12) :

1. **`LoyaltyVoucher.release` ignore `remainderSettledAt`.** Appelé sur un
   parent soldé, il le remet `available` à pleine valeur **à côté** du
   reliquat vivant (double valeur), et **garde la marque** : le bon réengagé
   plus tard ne laisserait plus jamais de reliquat (`leaveRemainder` rend
   `settled`). C3 n'y tombe pas (`due` n'est jamais soldé), C4 y tomberait.
2. **`parent_voucher_id` est `@unique`** (`loyalty.prisma`, relation 1-1
   `remainder`). Un parent rendu puis réengagé ne pourrait plus émettre de
   second reliquat : l'ancien, annulé mais conservé, tient la clé. La refusion
   **exige** de relâcher cette unicité aux seuls reliquats vivants.
3. **L'expiration de nuit ne prend pas le verrou du titulaire**
   (`ExpireLoyaltyVouchersHandler` : charge hors transaction, `expire`, puis
   `save` dans une transaction sans verrou ni relecture). `save` écrit le
   statut sans condition : un reliquat refusionné à une milliseconde de sa date
   limite peut être réécrit `expired` par-dessus. À corriger dans ce lot.
4. **`settleRemainder` ne revérifie pas la commande sous le verrou** : le
   passage de nuit lit les commandes porteuses AVANT le verrou, puis solde avec
   le montant de CETTE commande. Si elle a été annulée entre-temps et le bon
   réengagé par une autre, le reliquat serait calculé sur la mauvaise
   commande. Inoffensif pour `free` (la nuit ne voit jamais un bon soldé) ;
   **prérequis de C4**, fait dans ce lot (Q3). La relecture se fait **sans
   `FOR UPDATE`** sur `orders` : sous le verrou du titulaire, prendre un
   verrou de commande renverserait l'ordre orders → titulaire (C3b.5).
5. **Le courriel de C3 ment déjà dans un cas** : `voucherReturned` vaut
   `loyaltyVoucherId !== null`, même quand `release` fait tomber le bon en
   `expired` (date limite passée). Le client lit « votre bon vous est rendu »
   pour un bon mort. Et le booléen ne vit pas que dans l'outbox : il est
   recopié au **journal** (`b2b/growth/application/handlers/on-order-cancelled.handler.ts`),
   déclaré dans le contrat du fait (`packages/contracts/src/journal-facts/orders-production.ts`,
   `"order.cancelled"`), libellé au back-office
   (`shared/journal/key-labels.ts`, `voucherReturned: 'Bon de fidélité rendu'`),
   et lu par le courriel (`platform/mailer/order-cancelled-mail.ts`, copies
   fr/en/it, `send-order-cancelled-mail.handler.ts`) — quinze fichiers en tout,
   tests compris (compté le 2026-10-12). C3b le **remplace partout** (C3b.6).

**Les trois appelants restants de `release`** ne voient jamais un bon soldé
(lu le 2026-10-12) : l'abandon refuse `not_required` (`abandonStanding` rend
`nothing_to_settle`), l'échec à l'arrêt et l'expiration de la boutique ne
lisent que `payment_status IN (pending, failed)`
(`prisma-unsettled-settlement.reader.ts:27`, `unsettled-shop-order.where.ts:24`).
Une commande au compte portant un bon (soldé à la passation) ne les atteint
donc pas : le resserrement de `release` (C3b.4) ne leur coûte aucun cas.

Un reliquat **annulé par le staff** (`cancel`, statut `cancelled`) existe
aussi : la contrainte `loyalty_vouchers_cancellation_complete` exige auteur et
motif, et `recreditCancelled` lui recrédite son `pointsCost`, c'est-à-dire
**zéro**. Cf. C3b.3, cas 6.

#### C3b.2 Le modèle : une valeur d'enum, deux colonnes, une unicité partielle

**Une valeur neuve, `merged_back`** (« refondu dans son bon d'origine »).
Réutiliser `cancelled` serait faux deux fois : sa contrainte exige un auteur
staff et un motif (une annulation client future n'en aura pas), et
`cancelled` veut dire « le staff a retiré une valeur, recréditable » — la
refusion ne retire aucune valeur, elle la rend au parent.

Migrations, additives, **deux fichiers** (Postgres refuse d'utiliser une
valeur d'enum dans la transaction qui l'ajoute) :

1. `…_le_reliquat_refondu` : `ALTER TYPE "public"."LoyaltyVoucherStatus" ADD VALUE 'merged_back';`
2. `…_la_refusion_du_bon` :
   - colonnes nullables `merged_back_at timestamptz(3)`, `merged_back_order_id text`
     (identifiant opaque, sans clé étrangère — comme `loyalty_ledger_entries.order_id`) ;
   - `CHECK (("status" = 'merged_back') = ("merged_back_at" IS NOT NULL AND "merged_back_order_id" IS NOT NULL))` ;
   - `CHECK ("status" <> 'merged_back' OR "parent_voucher_id" IS NOT NULL)` — seul un reliquat se refond ;
   - `DROP INDEX "loyalty_vouchers_parent_voucher_id_key"` puis
     `CREATE UNIQUE INDEX "loyalty_vouchers_live_remainder_key" ON … ("parent_voucher_id") WHERE "status" IN ('available', 'reserved', 'expired', 'cancelled')` —
     **un seul reliquat non refondu par bon**, autant de reliquats refondus que
     de commandes annulées.

   **Le prédicat nomme les statuts qui bloquent**, au lieu d'exclure
   `merged_back` : une valeur d'enum ajoutée un jour ne se mettra pas à
   bloquer — ou à laisser passer — sans qu'on l'ait écrit. Les quatre
   bloquent, et pas seulement les deux « vivants » : un reliquat `expired` ou
   `cancelled` dit que la valeur du parent a été **consommée puis perdue** ;
   le parent ne doit pas pouvoir en laisser un second. Il ne le peut d'ailleurs
   pas par le domaine (cas 4 : parent `expired` ; cas 6 : refus) — l'index le
   tient aussi en base. Seul `merged_back` libère la place, parce que lui seul
   rend la valeur au parent. (Il n'existe pas de statut `redeemed` : un bon
   consommé reste `reserved`, `loyalty-voucher-shapes.ts`.)

**Prérequis, dans le même lot et AVANT la migration** (Q3, et `vitruve`
B2) :

- l'expiration de nuit prend le verrou du titulaire, **relit** le bon sous ce
  verrou, puis `expire` et `save` (`expire-loyalty-vouchers.handler.ts:41`,
  qui charge aujourd'hui hors transaction) ;
- `save` devient **conditionnel au statut chargé** : l'agrégat retient le
  statut qu'il avait à la reconstitution, et l'`updateMany` de
  `prisma-loyalty-voucher.repository.ts` (`:84-93`) porte
  `status: <statut chargé>` dans son `where`. Zéro ligne sur un id qui existe
  → `LoyaltyVoucherChangedMeanwhileError` (technique, rejouable), jamais une
  création. Un instantané périmé ne peut ainsi plus écraser ni un `expired`,
  ni un `merged_back` et son `merged_back_at`.

**Prisma et l'index partiel** — vérifié le 2026-10-12 contre la base de dev
(`prisma migrate diff --from-config-datasource --to-schema prisma/schema`,
lecture seule) : Prisma **ne propose pas** de supprimer l'index partiel
existant `orders_loyalty_voucher_live_key` (`WHERE status <> 'cancelled'`),
absent du schéma ; il en propose d'autres, non partiels
(`shop_carts_user_company_unique`, deux index du PIM). L'index neuf devrait
donc survivre à un `migrate dev` — mais c'est un constat sur une version, pas
une garantie : la **seule** défense est le test e2e
`refuse deux reliquats non refondus pour le même bon` (C3b.9), qui insère le
second en SQL brut et attend la violation.

Côté Prisma : `parentVoucherId` perd `@unique`, la relation `remainder`
devient `remainders LoyaltyVoucher[]` (seul le client généré la cite, vérifié
le 2026-10-12), et le commentaire du modèle nomme l'index partiel écrit à la
main. Le type de domaine `LoyaltyVoucherStatus`, `loyaltyVoucherStatusSchema`
(`packages/contracts/src/loyalty.ts:71`) et les trois `switch` d'affichage
(`loyalty-format.ts` du back-office, `loyalty-card.ts` et `loyalty.copy.ts` de
la boutique) gagnent la valeur, comme les lecteurs qui interprètent un statut
(recomptés le 2026-10-12) : `voucherStatusAt` (`loyalty-voucher-shapes.ts`,
neutre pour `merged_back`), `list-loyalty-vouchers.handler.ts` (l'écran staff
des bons : montrer « refondu dans le bon … »), `prisma-loyalty-ledger.reader.ts:64`
(sélectionne `status` pour le relevé : à libeller) ; `get-my-loyalty.handler.ts:83` et
`prisma-holder-loyalty.reader.ts:60` (bons « éteints ») **ne** la listent
**pas** : un reliquat refondu n'est pas un bon perdu, le client ne doit pas le
voir dans son historique de bons morts — il retrouve le parent.

#### C3b.3 La règle, pure, et ses six issues

Une fonction de domaine `voucherRestitutionOf(parent, remainder, now)` —
fichier `b2b/loyalty/domain/services/voucher-restitution.ts`, sans horloge
ni port — lue deux fois, comme `cancellationOf` : par l'aperçu (sans verrou)
et par le geste (sous le verrou du titulaire). `remainder` est le reliquat
**vivant** du parent (`status <> merged_back`), ou `null`.

| #   | État lu                                                                     | Issue                           | Effet                                                                                                                       |
| --- | --------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | parent `reserved`, non soldé, avant sa date limite                          | `returned`                      | parent → `available` (l'actuel `release`)                                                                                   |
| 2   | parent `reserved`, soldé `none` (pas d'enfant), avant sa date limite        | `returned`                      | parent → `available`, `remainderSettledAt` → `null`                                                                         |
| 3   | parent soldé, enfant `available` et **non échu**                            | `merged`                        | enfant → `merged_back` (instant, commande) ; parent → `available`, `remainderSettledAt` → `null`, valeur et date d'origine  |
| 4   | parent `reserved`, date limite passée (soldé ou non, enfant échu, `lapsed`) | `lapsed`                        | parent → `expired` (`expiredAt` = maintenant) ; un enfant `available` échu est écrit `expired` aussi ; **rien n'est rendu** |
| 5   | enfant `reserved`                                                           | **refus**                       | issue `blocked` → 409 qui nomme la commande vivante qui le porte (C3b.7)                                                    |
| 6   | enfant `cancelled` (le staff l'a annulé)                                    | **refus** (Q1, Hugo 2026-10-12) | issue `blocked` → 409 (C3b.7)                                                                                               |

Les dates limites coïncident : un reliquat porte **la date limite de son
parent** (`leaveRemainder`). « Enfant échu » et « parent échu » sont donc le
même instant ; le cas 4 n'a pas de sous-cas où l'un vivrait sans l'autre.
Échu se lit à l'horloge (`isExpiredAt`) : un enfant `available` passé sa date,
que la nuit n'a pas encore écrit, est le cas 4, pas le 3.

**Aucun point n'est recrédité, dans aucun cas.** Les points ont été payés une
fois, par le parent (`converted`) ; le reliquat coûte 0. La refusion ne touche
pas au grand livre.

**Le reliquat n'est jamais supprimé** : il passe `merged_back`, avec l'instant
et la commande annulée. Son montant, ses dates, son parent restent.

**La chaîne** (le reliquat R1 du bon P a servi sur O2, et laissé R2) :

- annuler **O2** : la commande porte R1 ; R2 est son enfant → cas 3 : R2
  refondu, R1 retrouve sa valeur et sa date (celle de P) ;
- annuler **O1** pendant qu'O2 vit : R1 est `reserved` → cas 5, le refus
  nomme O2 ; après l'annulation d'O2, R1 redevient `available` et O1 devient
  annulable (cas 3, R1 refondu dans P) ;
- O2 retirée ou payée : O1 reste refusée tant qu'O2 vit — le refus le dit.

La règle ne remonte jamais la chaîne : elle ne regarde que **le bon de la
commande** et **son enfant vivant**. Défaire O1 quand O2 vit voudrait dire
reprendre une valeur déjà dépensée.

**Idempotence.** L'annulation de la commande est déjà unique (verrou de la
ligne `orders`, écriture conditionnée, la restitution n'est appelée que si
l'écriture a franchi ; un rejeu de transaction repart d'un `ROLLBACK`). La
fidélité ajoute la sienne, et vérifie que le bon est **engagé par cette
commande** avant de le toucher. Sous le verrou, la commande annulée vient
d'être écrite `cancelled` : elle n'est plus « vivante ». La fidélité lit
`VoucherOrderReader.liveOrdersCarrying([parent])` :

- parent `reserved` et **aucune** commande vivante ne le porte → c'est bien
  celle qu'on annule : la règle s'applique ;
- parent `reserved` et une **autre** commande vivante le porte → il a déjà
  été rendu par cette annulation, puis réengagé : issue `already` ;
- parent `available` ou `expired`, sans enfant non refondu, ou avec un enfant
  `merged_back` pour cette commande → rejeu après `returned`, `merged` ou
  `lapsed` : issue `already`.

`already` **n'écrit rien et ne publie rien** — ni fait de fidélité, ni rien
dans le fait `order.cancelled`, qui a déjà franchi une fois ; l'annulation
n'en publie de toute façon qu'un (C3.5).

#### C3b.4 L'agrégat

Sur `LoyaltyVoucher` (`domain/entities/loyalty-voucher.ts`) :

- **`mergeBackInto(parent, at, orderId)`** sur l'enfant : exige
  `parentVoucherId === parent.id`, `available`, non échu à `at` ; sinon
  `LoyaltyVoucherNotMergeableError`. → `merged_back`.
- **`reinstate(remainder, at, orderId)`** sur le parent : appelle
  `voucherRestitutionOf`, applique l'issue — fait appeler `mergeBackInto` à
  l'enfant au cas 3, `lapse` au cas 4 — et la rend. Les cas 5 et 6 ne lèvent
  pas : ils **rendent** une issue `blocked` (C3b.5), pour que la phrase soit
  écrite par la commande, qui seule sait si l'autre commande est annulable.
  C'est la **seule** méthode qui remet `remainderSettledAt` à `null`.
- **`lapse(at)`** sur le parent, transition neuve du cas 4 : `reserved` et
  échu à `at` → `expired`, `expiredAt = at`. `expire()` ne convient pas : il
  ne part que d'`available` (`isExpiredAt`, `loyalty-voucher.ts:158`), et
  `release` en est le seul autre chemin vers `expired`.
- **`release` se resserre** : sur un parent soldé, il lève
  `LoyaltyVoucherRemainderSettledError` au lieu de doubler la valeur. Les
  trois appelants restants (abandon, expiration de la boutique, échec à
  l'arrêt) ne voient que des cartes non payées, donc jamais un bon soldé
  (C3b.1) : le resserrement ne change rien pour eux, il ferme la porte à C4.

Deux agrégats mutés ensemble, et c'est voulu : même titulaire, même verrou,
même transaction ; l'invariant (« la valeur d'un bon et de son reliquat vivant
ne se compte qu'une fois ») porte sur la paire.

Le dépôt gagne `loadLiveRemainderOf(parentId): Promise<LoyaltyVoucher | null>`
(`where parentVoucherId = …, status <> merged_back`, au plus une ligne par
l'index partiel) ; `save` range les deux colonnes neuves.

#### C3b.5 La frontière et les verrous

Le port d'écriture que la commande déclare, `LoyaltyVoucherRedemption`
(`b2b/orders/domain/ports/loyalty-voucher-redemption.ts`), gagne :

```ts
/** La commande qui portait le bon est annulée : le rendre, refondre son reliquat, ou constater qu'il est éteint. */
abstract reinstate(voucherId: string, order: { id: string; number: string }, now: Date): Promise<VoucherRestitution>;
```

`VoucherRestitution` (déclaré côté commande, à côté du port) :

```ts
type VoucherRestitution =
  | {
      kind: "returned" | "merged" | "lapsed";
      voucherValueCents: number;
      remainderValueCents: number | null;
      expiresAt: Date;
    }
  | { kind: "already" }
  | {
      kind: "blocked";
      cause: "remainder_engaged";
      remainderValueCents: number;
      order: { id: string; number: string };
    }
  | { kind: "blocked"; cause: "remainder_cancelled"; remainderValueCents: number };
```

`blocked` → `CancelOrderHandler` lève `OrderNotCancellableError` avec un bloc
neuf de `CancellationBlock` (`voucher_remainder_engaged`,
`voucher_remainder_cancelled`) : c'est un `BusinessError`, que `isRefusal`
classe « pas de rejeu », et la transaction entière — retrait au fournil
compris — s'annule. Pour le cas 5, la commande lit la règle de l'**autre**
commande (`cancellationOf` sur `subjects.find(O2)` et l'inscription au
fournil, sans verrou : c'est une phrase) pour choisir la sortie qu'elle
propose (C3b.7).

Un **second port, de lecture**, `VoucherRestitutionPreview`
(`previewOf(voucherId, now): Promise<VoucherRestitutionPreview>`), sert
l'aperçu du détail : même règle, sans verrou, sans écriture (ISP — l'écran ne
dépend pas d'un port d'écriture). Les deux sont implémentés par
`LoyaltyVoucherRedeeming` et reliés dans `appBootstrap/loyalty-voucher.module.ts`
comme les trois méthodes existantes (cycle `loyalty → orders` déjà là, §11 bis
S8). Pour nommer la commande d'un enfant engagé (cas 5), la fidélité lit
`VoucherOrderReader.liveOrdersCarrying([enfant])` — le port que la commande
publie déjà pour elle.

`CancelOrderHandler.afterCancelled` remplace `release` par `reinstate` et
passe l'issue au fait durable. Rien d'autre ne bouge dans l'ordre des gestes.

**Ordre des verrous**, inchangé et sans cycle :

| Geste                                         | Ordre                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| annulation (C3/C3b)                           | ligne `orders` (`FOR UPDATE`) → journée du fournil → **verrou du titulaire** → relire P et son enfant |
| passation qui engage R1                       | verrou du titulaire → `reserve(R1)` → insertion de la commande (aucune ligne existante verrouillée)   |
| passage de nuit (reliquats)                   | verrou du titulaire, par bon ; la commande relue **sous** ce verrou, **sans** `FOR UPDATE`            |
| expiration de nuit                            | **aujourd'hui aucun** ; C3b : verrou du titulaire, relire, `expire`, `save` conditionnel (C3b.2)      |
| abandon, expiration boutique, échec à l'arrêt | ligne `orders` → verrou du titulaire                                                                  |

Personne ne prend un verrou de commande **après** celui du titulaire : pas
d'attente circulaire.

**Les deux courses du sujet :**

- **une autre commande engage le reliquat au même moment** : les deux
  prennent le verrou du titulaire. Si la passation passe d'abord, l'annulation
  relit R1 `reserved` → cas 5, refus qui nomme la nouvelle commande, et
  l'annulation entière s'annule. Si l'annulation passe d'abord, R1 est
  `merged_back` quand la passation le relit → `reserve` refuse
  (`LoyaltyVoucherNotUsableError`), la passation échoue et rend sa clé. Le
  client voit alors son bon P revenu à pleine valeur ;
- **le passage de nuit** : pour `free`, il ne voit jamais le bon (soldé, hors
  de `loadReservedUnsettled`). Pour C4 : sous le verrou, `settleRemainder`
  doit **relire** la commande vivante qui porte le bon et vérifier qu'elle est
  celle du lot et qu'elle est `paid`, sinon ne rien faire (C3b.1, 4). L'ordre
  annulation → nuit donne alors « bon rendu, rien à solder » ; nuit →
  annulation donne le cas 3.

#### C3b.6 Le journal

**Un fait de fidélité neuf, `loyalty.voucher_reinstated`**, sujet le
titulaire, publié par `publishTraced` dans la transaction (comme les autres
faits du bon) pour les issues `returned` et `merged` :

```
{ voucher: named(parent), remainder: named(enfant) | null,
  order: { id, name }, outcome: "returned" | "merged",
  valueCents (parent), remainderCents | null, expiresAt }
```

L'issue `lapsed` publie `loyalty.voucher_expired` sur le parent — ce que fait
déjà `release` — et un second sur l'enfant s'il est écrit `expired`. `already`
ne publie rien. Déclaration dans `packages/contracts/src/journal-facts/accounting.ts`,
phrase dans `loyalty-phrases.ts` du back-office (« Bon de 12,00 € rendu au
client après l'annulation de la commande C-… ; le reliquat de 4,50 € est
refondu dedans. Valable jusqu'au … »).

**Le fait durable `order.cancelled`** remplace `voucherReturned: boolean` par
`voucher: null | { outcome: "returned" | "merged" | "lapsed"; voucherValueCents; remainderValueCents | null; expiresAt }`,
**partout où le booléen passe** : l'outbox (`order-cancelled.event.ts`), la
recopie au journal (`b2b/growth/application/handlers/on-order-cancelled.handler.ts`),
le contrat du fait (`packages/contracts/src/journal-facts/orders-production.ts`,
`"order.cancelled"`), la phrase et le libellé du back-office
(`orders-phrases`, `key-labels.ts` : `voucherReturned` retiré, `voucher` et
ses champs libellés), le courriel.

**Remplacement sec, sans union ni lecture de l'ancienne forme** — décidé le
2026-10-12 : C3 n'a **jamais** été promu sur `main` (rien poussé depuis le
déploiement `f91935351`), aucun fait `order.cancelled` n'existe donc en
production, et le dépôt est en pré-release (CLAUDE.md, §0). Un fait de dev
en vol au moment du bâti est jeté avec la base de dev, pas lu. Cette phrase
devient fausse dès que C3 est sur `main` : si C3 part avant C3b, la lecture
de l'ancienne forme redevient nécessaire.

#### C3b.7 L'écran staff

`AdminOrderCancellability` (`packages/contracts/src/admin-order-detail.ts`)
devient :

```ts
export type AdminOrderCancellability =
  | { readonly cancellable: true; readonly voucher: AdminCancellationVoucher | null }
  | { readonly cancellable: false; readonly reason: string };

/** Ce que l'annulation fera du bon — calculé par la même règle que le geste, sans verrou. */
export type AdminCancellationVoucher =
  | {
      readonly outcome: "returned";
      readonly voucherValueCents: number;
      readonly expiresAt: string;
      readonly sentence: string;
    }
  | {
      readonly outcome: "merged";
      readonly voucherValueCents: number;
      readonly remainderValueCents: number;
      readonly expiresAt: string;
      readonly sentence: string;
    }
  | {
      readonly outcome: "lapsed";
      readonly voucherValueCents: number;
      readonly expiresAt: string;
      readonly sentence: string;
    };
```

`sentence` est la phrase du serveur, montrée telle quelle (même principe que
`reason`) ; les montants servent à la mise en forme. Phrases :

- `returned` : « Le bon de fidélité de 12,00 € utilisé sur cette commande sera
  rendu au client, valable jusqu'au 30/11. »
- `merged` : « Le bon de 12,00 € avait laissé un reliquat de 4,50 €. Ce
  reliquat sera annulé et le bon de 12,00 € redeviendra disponible jusqu'au
  30/11 : le client retrouve le bon d'avant la commande. »
- `lapsed` : « Le bon de fidélité de 12,00 € est arrivé à échéance le 30/09 :
  il ne sera pas rendu. »

Les refus 5 et 6 arrivent en `cancellable: false`, avec une phrase qui ne
promet que ce qui est possible (`cancellationRefusalOf`) :

- cas 5, **O2 annulable** : « Le reste de 4,50 € du bon utilisé ici a servi
  sur la commande C-… : annulez-la d'abord, puis celle-ci. »
- cas 5, **O2 non annulable** (prête, retirée, payée, au compte, inscrite) :
  « Le reste de 4,50 € du bon utilisé ici a servi sur la commande C-…, qui ne
  peut plus être annulée : l'annulation de cette commande n'est plus
  possible. Voyez avec la direction. »
- cas 6 : « Le reste de ce bon (4,50 €) a été annulé par l'équipe :
  l'annulation de la commande n'est plus possible. Voyez avec la direction. »

`GetAdminOrderHandler.cancellabilityOf` appelle `VoucherRestitutionPreview`
quand la commande porte un bon et que la règle de commande la laisse passer.
La confirmation en ligne reprend `sentence` sous la phrase que le client
recevra. **Après** : l'historique du détail lit `order.cancelled` et
`loyalty.voucher_reinstated` ; aucune colonne neuve sur `orders`. Le montant
affiché suit l'unité du bon (centimes HT, `loyalty.prisma`) et le formateur
existant du back-office — ne pas en inventer un second.

Le refus `voucher_settled` disparaît de `cancellationOf`, de sa phrase et de
`CancellationBlock` ; son JSDoc daté est retiré dans le même commit.

#### C3b.8 Le courriel client

Le gabarit `customer.order-cancelled` lit `voucher` au lieu du booléen
(fr, en, it) :

- `returned` : « Votre bon de fidélité de 12,00 € vous est rendu : vous
  pourrez l'utiliser sur une prochaine commande jusqu'au 30/11. »
- `merged` : « Votre bon de fidélité retrouve sa valeur de 12,00 €, valable
  jusqu'au 30/11. Le bon de 4,50 € qui vous avait été remis en reliquat est
  remplacé par celui-ci. »
- `lapsed` : rien sur le bon — **corrige le mensonge de C3** (C3b.1, 5) ;
  Hugo, 2026-10-12 (Q2).

#### C3b.9 Les tests

- **domaine** (`voucher-restitution.ts`, `loyalty-voucher.ts`) : les six
  issues ; frontière de date limite (`now === expiresAt` → `lapsed`) ;
  enfant d'un autre parent refusé ; `mergeBackInto` sur un enfant échu,
  réservé, annulé ; `reinstate` rejoué → `already` sans mutation ; `release`
  sur un parent soldé lève ; après `merged`, réengager P puis
  `leaveRemainder` émet un **nouveau** reliquat (la marque est bien nulle) ;
  `lapse` refuse un parent non échu ou non réservé ; aucun point dans aucun
  cas ; idempotence : rejeu après `returned`, `merged`, `lapsed` → `already`,
  parent réengagé par une autre commande → `already` ;
- **application** : `LoyaltyVoucherRedeeming.reinstate` relit sous le verrou,
  sauve les deux bons, publie le bon fait ; refus 5 nomme la commande lue par
  `VoucherOrderReader` ; `CancelOrderHandler` traduit `blocked` en refus
  (deux phrases du cas 5 selon l'annulabilité d'O2), passe l'issue au fait
  durable, ne publie rien pour `already` ; `save` sur un statut changé
  entre-temps lève au lieu d'écraser ; `ExpireLoyaltyVouchersHandler`
  prend le verrou et relit ; `settleRemainder` ne fait rien si la commande
  relue n'est plus celle du lot ;
- **e2e** (`order-staff-cancel-voucher.e2e-spec.ts`, dates relatives) :
  `free` + bon imputé en entier → bon rendu ; `free` + reliquat disponible →
  reliquat `merged_back`, parent `available`, marque nulle, date d'origine,
  solde de points inchangé ; reliquat engagé sur une autre commande → 409 qui
  nomme la commande, **rien** n'est écrit (ni annulation, ni retrait au
  fournil) ; chaîne P→R1→R2 dans les deux ordres ; reliquat échu → annulée,
  bon non rendu, courriel sans phrase de bon ; `due` + bon échu → courriel
  sans « rendu » (régression C3) ; **course** passation qui engage R1 ×
  annulation (deux ordres, deux transactions tenues par un verrou) ;
  **course** expiration de nuit × refusion à la date limite ; réutiliser P
  après refusion → second reliquat accepté par l'index partiel ;
  **`refuse deux reliquats non refondus pour le même bon`** (insertion SQL
  brute, violation attendue — seule défense contre une dérive Prisma qui
  supprimerait l'index, C3b.2) ; le journal `order.cancelled` porte `voucher`
  et plus `voucherReturned` ; l'aperçu de `GET /admin/orders/:id`
  annonce la même issue que le geste ;
- **contrats / front** : `AdminOrderCancellability` à trois formes ; la
  confirmation affiche `sentence` ; l'historique rend la phrase du fait neuf.

#### C3b.10 Questions pour Hugo — toutes tranchées

> ✅ **Tranchées par Hugo le 2026-10-12 : « oui aux trois propositions »** —
> Q1 refus, Q2 le courriel se tait sur le bon, Q3 les deux correctifs entrent
> dans ce lot.

- **Q1** — un reliquat **annulé par l'équipe** (cas 6) : refuser l'annulation
  de la commande (proposé : rendre le bon ferait renaître une valeur que
  l'équipe a retirée), ou annuler sans rendre le bon ?
- **Q2** — bon échu à l'annulation (cas 4) : le courriel se tait sur le bon
  (proposé), ou dit « votre bon était arrivé à échéance » ?
- **Q3** — les correctifs de C3b.1 (3 et 4 : verrou de l'expiration, relecture
  dans `settleRemainder`) entrent dans ce lot (proposé, ils sont courts et le
  4 est un prérequis de C4), ou dans un lot à part ?

#### C3b.11 Sort des objections de `vitruve` (2026-10-12)

| Objection                                                          | Sort                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| B1 `voucherReturned` aussi au journal, au contrat, aux libellés    | **réglée** : remplacement sec partout, daté et justifié (C3b.1, C3b.6)                     |
| B2 prédicat de l'index, expiration non verrouillée, `save` aveugle | **réglée** : statuts nommés, verrou + relecture + `save` conditionnel en prérequis (C3b.2) |
| S cas 5 / 6 sans sortie                                            | **réglée** : phrases qui ne proposent que le possible (C3b.7)                              |
| S idempotence de `reinstate`                                       | **réglée** : « engagé par cette commande », `already` muet (C3b.3)                         |
| S index absent du schéma Prisma                                    | **vérifiée** sur la base de dev + test e2e nommé (C3b.2, C3b.9)                            |
| S `release` resserré et la commande au compte                      | **vérifiée** : aucun appelant ne l'atteint (C3b.1)                                         |
| S relecture de `settleRemainder` sans `FOR UPDATE`                 | **réglée** (C3b.1, C3b.5)                                                                  |
| m lecteurs de `LoyaltyVoucherStatus`                               | **recomptés** (C3b.2)                                                                      |
| m transition du cas 4                                              | **nommée** : `lapse` (C3b.4)                                                               |

### Lot C5 — annuler une commande AU COMPTE, par le staff (conçu le 2026-10-12, contredit, révisé)

> Hugo, 2026-10-12 : annuler une commande au compte vient **après le lot
> livraison et avant le remboursement (C4)**. Il a demandé l'enchaînement sans
> arrêt : les questions techniques sont tranchées ici, seules celles du §C5.9
> lui reviennent. `vitruve` est passé le même jour (sort en C5.10) ; la
> révision suit **« interdire plutôt que vérifier »** : l'annulation **ferme**
> la ligne d'encaissement, et aucun geste comptable ne sait plus la toucher.
>
> Il reprend C3 tel quel (route, droit `b2b_cancel_order`, retrait au fournil,
> transaction, fait durable, journal, courriel, C3b pour le bon) et n'y ajoute
> que la **frontière avec la comptabilité** que C3.9 avait sortie.

#### C5.1 Ce que le code dit — ouvert le 2026-10-12

1. **L'assiette est écrite une fois** : `billableOrderWhere`
   (`b2b/accounting/infrastructure/billable-order-criterion.ts`) =
   `not_required ∧ total > 0 ∧ status <> cancelled ∧ company_id non nul ∧
created_at ∈ [from, to[`. L'émission (`prisma-monthly-invoicing.reader.ts:33`),
   la constitution (`prisma-collection-candidates.reader.ts:44`) et
   `PrismaOrderCollectionRepository.load` la lisent. Une annulée **validée
   avant** leur lecture n'y entre jamais : le trou est la course seule.
2. **L'émission mensuelle prépare hors transaction** (`issue-monthly-invoices.handler.ts:137`,
   `uninvoicedOrders` `:167`) puis émet **groupe par groupe** (`:143`) dans une
   transaction courte (`:235`), **sans relire le statut ni prendre
   `OrderInvoicingLock`** (BLOQUANT 1, confirmé). `InvoiceIssuer.issue`
   (`application/services/invoice-issuer.ts:57`) ne prend qu'un verrou : la
   ligne du compteur (`prisma-invoice-numbering.ts`, `INSERT … ON CONFLICT DO
UPDATE`, tenue jusqu'au `COMMIT`). Aucune ligne `orders`.
3. **Le groupe d'une facture** est `invoiceGroupKey(payeur, mandat effectif)`
   (`domain/services/monthly-invoicing.ts:71`), formé par `byMandate` (`:131`)
   avec `billable` et `unbillable`. **`effectiveMandateOf`**
   (`domain/services/collection-verdict.ts:91`) se calcule **bon par bon**, sur
   le bon, les suivis et les mandats — jamais sur les autres bons du groupe.
   Retirer un bon ne change donc ni le mandat ni la clé des autres.
4. **La constitution** prend un verrou consultatif par entité
   (`constitute-collection-batches.handler.ts:108`) puis appelle `readAssembly`
   (`application/collection-constitution-support.ts`), qui lit les candidats
   (`collectableOrders`, `:110` du support) **et appelle déjà
   `assembleCollection`** (`:124-138`). Un filtre « après `readAssembly` »
   arriverait trop tard (BLOQUANT 1 de la révision). `get-collection-preview.handler.ts:70`
   appelle le même `readAssembly`, sans transaction.
5. **`OrderInvoicingLock` est un `SELECT … FOR UPDATE` sur la ligne `orders`**
   (`prisma-order-invoicing-lock.ts`) — le verrou que C3 prend en premier
   (`prisma-order-cancellation.repository.ts:28-34`).
6. **« Facturée »** : `invoice_order` (380, unicité `invoice_order_invoiced_once`).
7. **`order_collection`** (`order_id` PK, `state`, `batch_id`, `line_rank`) —
   pas `collection_batch_line`. L'absence de ligne vaut `due`. Transitions de
   l'agrégat `OrderCollection` (`domain/entities/order-collection.ts`), **toutes
   gardées par `assertIn`** : `batch`/`exclude` (depuis `due|excluded`),
   `release` (`batched`), `collect` (`batched`), `bounce` (`collected`),
   `represent` (`returned`), `writeOff` (`returned`), `settleReturned`
   (`returned`), `settleOtherwise` (`due|excluded`).
8. **`saveAll` est un `upsert` inconditionnel** (`prisma-order-collection.repository.ts`) :
   le dernier écrivain gagne. `load` lit sans verrou.
9. **Le relevé de cycle** (`billing_statement`, `@@unique([batchId, lineRank])`,
   bons dans `billing_statement_order`) : un relevé `active` qui porte la
   commande ⇔ sa ligne est vivante ⇔ `state ∈ {batched, collected, returned,
written_off}`. Le test sur `order_collection` suffit.
10. **Un rejet bancaire** est un `collection_return` rattaché à une **ligne**
    (`end_to_end_id`). Une commande re-présentée revient à `due` avec
    `batch_id = null` : son rejet ne se retrouve que par
    `billing_statement_order → billing_statement (batch, rang) → collection_return`.
11. **Les verrous de C3/C3b ne touchent aucune ligne `orders`** :
    `ProductionDayLock` = consultatif `production_day:<jour>` + `FOR UPDATE` sur
    `production_day` (`prisma-production-day.lock.ts:50-54`) ; titulaire du bon
    = consultatif (`prisma-loyalty-holder.lock.ts:45`), la commande y est relue
    **sans** `FOR UPDATE` (`loyalty-voucher-redeeming.ts:182`).
12. **Collation** : les bases de dev et de test sont en `en_US.utf8` (lu le
    2026-10-12 dans `pg_database`). Un `ORDER BY id` y n'est pas l'ordre
    binaire ; on ne s'y fie pas (C5.3).
13. **`collectableOrders` lit AUSSI `order_collection`**
    (`prisma-collection-candidates.reader.ts:42-73`, états `:54-56`, rendus
    `:71`) : l'état d'encaissement des candidats est lu **avant** tout verrou,
    puis réécrit par `saveAll` (upsert sans version,
    `prisma-order-collection.repository.ts:54-63`). **Course préexistante à
    C5** : un `settleOtherwise` validé entre cette lecture et le `COMMIT` de la
    constitution est écrasé, et une commande déjà réglée est prélevée.
14. **Le relevé ne porte que les bons réellement débités** : `buildStatements`
    (`application/billing-statement-support.ts:41`) écrit
    `orders: draft.orders` — les bons du débit de **cette** ligne — et rien
    pour une ligne qui règle des factures. Un relevé ne passe `cancelled` que
    par `cancelForBatch` (`prisma-billing-statement.repository.ts:53`, appelé
    par `cancel-collection-batch.handler.ts:51`) : un lot annulé **avant
    dépôt**, qui ne peut porter aucun retour.
15. **`cancellationOf`** refuse `account` d'office (`order-cancellation.ts:100`,
    phrase `:164`) ; le contrôle hors verrou de `cancel-order.handler.ts:98/106`
    appelle `cancellationStateOf(subject, null)`.

#### C5.2 Le critère

Une commande de régime `account` (`not_required ∧ total > 0`) est annulable
**ssi**, dans cet ordre de refus :

| #   | Condition                                                                                 | Où                                   |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| 1-2 | `placed` (inchangé)                                                                       | `orders.status`                      |
| 3   | **non facturée** : aucune ligne `invoice_order` 380                                       | `invoice_order`                      |
| 4   | **non engagée** : `order_collection` absente, ou `state ∈ {due, excluded}`                | `order_collection`                   |
| 5   | **jamais rejetée par la banque** (aucun `collection_return` sur une ligne qui l'a portée) | C5.1, 10                             |
| 6   | non inscrite au fournil (C3)                                                              | `OrderWithdrawalDesk.withdraw`       |
| 7   | bon : C3b tel quel                                                                        | `LoyaltyVoucherRedemption.reinstate` |

États bloquants : `batched`, `collected`, `returned`, `written_off`,
`settled_otherwise` (et `cancelled`, C5.4 — inatteignable : la commande est
déjà refusée en 1). `due`/`excluded` n'engagent rien. Une `excluded` facturée
(« plusieurs mandats ») tombe en 3.

**Condition 5 — choix par défaut (S4)** : une commande re-présentée est `due`,
mais elle a déjà été présentée, rejetée, son relevé et son avis sont partis.
L'annuler effacerait une histoire bancaire que l'équipe suit dans les retours.
Refusée dans ce lot ; question métier pour plus tard (C5.9, 3). En pratique
une re-présentée est presque toujours facturée et tombe en 3 ; la condition
tient le cas sans facture (plancher de facturation nul).

Ordre dans la transaction : `FOR UPDATE` (1-2), comptabilité (3-5), fournil
(6), bon (7) — un refus comptable ne verrouille pas la journée.

#### C5.3 Le verrou commun — décision

> Schémas de l'ordre des verrous et des courses :
> [`verrous-de-l-annulation.md`](verrous-de-l-annulation.md).

**La ligne `orders`, `FOR UPDATE`, partout où une commande au compte entre dans
une facture, un lot, ou change d'état d'encaissement hors lot.** Pas de verrou
par payeur (il faudrait résoudre le payeur avant de verrouiller : la course
même) ni par entité (toutes les annulations derrière une constitution).

**Un seul mécanisme d'ordre (S7)** : un adaptateur unique,
`PrismaOrderRowsLock.lockAll(ids)`, à côté de `PrismaOrderInvoicingLock` :

```sql
SELECT id FROM public.orders WHERE id = ANY($1) ORDER BY id COLLATE "C" FOR UPDATE
```

Postgres verrouille dans l'ordre de sortie du tri. `COLLATE "C"` rend l'ordre
binaire quelle que soit la collation de la base (C5.1, 12). L'émission **et**
la constitution passent par lui ; l'annulation, qui ne prend qu'une ligne, n'a
pas d'ordre à respecter. `OrderInvoicingLock.lock(id)` reste pour une ligne.

**Côté émission** (`issueFor`, dans la transaction `:235`, avant `issuer.issue`) :

1. `lockAll` sur **tous** les bons du groupe, `billable` **et** `unbillable`
   (MINEUR : un bon non facturable annulé ne doit pas rester signalé) ;
2. `CancelledOrdersReader.cancelledAmong(ids)` (port existant) ;
3. **retirer les annulées des deux listes du groupe** — rien d'autre. Ce n'est
   pas un recalcul dans le handler : le prix se calcule **ensuite**, dans
   `draftOf` → `simulateInvoiceDossier`, sur la liste restante. Le mandat et la
   clé des bons restants ne bougent pas (C5.1, 3) : « replanifier » rendrait
   exactement le même groupe moins les annulées, on n'appelle donc pas
   `planMonthlyInvoices` ;
4. **recalculer `outcomeKey`** (`issue-monthly-invoices.handler.ts:228`) sur
   le groupe filtré : elle liste les bons non facturables du groupe ;
5. le groupe **disparaît** (plus aucun bon) → rien d'émis, rien de signalé,
   l'issue rangée « sans objet » ; il ne reste que des `unbillable` → le
   signalement existant ; sinon émettre.

Le groupe ne peut pas **changer de clé** : la clé dépend du payeur et du mandat
lus dans `prepare`, que l'annulation ne touche pas. Un bon passé **après**
`prepare` n'y entre pas (il attend la période suivante, comportement
d'aujourd'hui). Le verrou est tenu jusqu'au `COMMIT` qui écrit `invoice_order` :
une annulation qui l'attend relit une commande facturée → refus 3.

**Côté constitution — dans `readAssembly`** (B1, et BLOQUANT du 2ᵉ passage) :
la lecture des candidats est **coupée en deux**, et **rien** de ce qui est lu
avant le verrou ne sert à constituer :

1. `CollectionCandidatesReader.collectableOrderIds(floor, closesAt)` — les
   seuls ids de l'assiette, sans état ni contenu ;
2. **en mode constitution** : `lockAll(ids)` ;
3. `collectableOrders(ids)` — **relit sous verrou** les commandes
   (`billableOrderWhere ∧ id ∈ ids` : une annulée validée entre 1 et 2 en sort)
   **et** leur `order_collection` (une réglée autrement ou fermée entre 1 et 2
   n'est plus ouverte, `isOpen` l'écarte) ;
4. `invoicesOf`, `billingFollowsOf`, `assembleCollection` sur cette relecture
   seulement.

Sous le verrou, aucun écrivain d'état hors lot ne peut plus passer : l'annulation
et `settle-order-otherwise` prennent la même ligne (C5.4). La relecture n'a donc
plus besoin de `cancelledAmong`. Cela ferme aussi la **course préexistante**
« réglée autrement × constitution » (C5.1, 13), qui n'avait rien à voir avec
l'annulation.

`AssemblyMode` gagne `lockRows: boolean` : `TO_CONSTITUTE` le porte, l'**aperçu**
(`get-collection-preview.handler.ts:70`) non. L'aperçu fait les mêmes 1, 3, 4
sans verrou : il écarte les annulées et les réglées validées, et dit l'état du
moment, comme aujourd'hui.

**Ordre des verrous, sans cycle** :

| Geste                   | Ordre                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| annulation (C3/C3b/C5)  | ligne `orders` (une) → journée du fournil → titulaire du bon         |
| émission mensuelle      | lignes `orders` du groupe (`COLLATE "C"`) → compteur de numérotation |
| constitution            | consultatif entité → lignes `orders` des candidats (`COLLATE "C"`)   |
| réglée autrement (C5.4) | ligne `orders` (une)                                                 |
| facture carte, avoirs   | ligne `orders` (une) → compteur                                      |

Vérifié (C5.1, 2 et 11) : ni le compteur, ni la journée, ni le titulaire ne
prennent de ligne `orders` ; l'annulation ne prend ni entité ni compteur ;
les deux preneurs de plusieurs lignes les prennent dans le même ordre. Coût
accepté : la constitution tient les lignes de ses candidats jusqu'au `COMMIT`.

#### C5.4 Fermer la ligne d'encaissement (B2, S5)

**L'annulation d'une commande au compte écrit, dans sa transaction, un état
terminal `cancelled` de sa ligne `order_collection`.** Une vérification ne
suffit pas : `saveAll` écrase (C5.1, 8). Une fois `cancelled`, plus aucune
transition de l'agrégat ne l'accepte.

- **Migration additive, deux fichiers** : `ALTER TYPE "OrderCollectionState"
ADD VALUE 'cancelled'` seul dans le sien (une valeur ajoutée ne s'emploie pas
  dans la transaction qui l'ajoute), le code l'emploie ensuite. Aucune donnée
  réécrite.
- **Agrégat** : `OrderCollection.close(at)` — `due|excluded → cancelled`,
  `batch_id`/`line_rank`/`exclusion_reason` à `null` ; et
  `OrderCollection.closedAtCancellation(orderId, amount, at)` quand la ligne
  n'existe pas (absence = `due`). **Aucune `assertIn` existante ne nomme
  `cancelled`** (C5.1, 7) : `batch`, `exclude`, `release`, `collect`, `bounce`,
  `represent`, `writeOff`, `settleReturned`, `settleOtherwise` la refusent
  d'office. Un test par transition le prouve.
- **Frontière** : la commande ne l'écrit pas elle-même. Le port de C5.5 devient
  **lecture + écriture** sous le verrou de l'appelant : `AccountOrderEngagement`
  (déclaré par `b2b/orders`, implémenté par la comptabilité) avec
  `engagementOf(orderId)` et `closeForCancellation(orderId, at)`, exécutés
  **dans l'unité de travail** de l'annulation (précédent : `BinDesk`,
  `OrderWithdrawalDesk`). Un `ISP` : l'aperçu du détail ne reçoit que la lecture
  (`AccountOrderEngagementReader`).
- **Libellé** : `OrderCollectionStateView` (`packages/contracts/src/collection-batch.ts:42`)
  et `ORDER_COLLECTION_STATE_LABELS` (`:52`) gagnent `cancelled: "Commande
annulée"`. `packages/**` bouge : `pnpm test` à la racine.
- **Mapper** : `toOrderCollectionState` (`order-collection.mapper.ts:5`) recopie
  `row.state` tel quel, et `rehydrate` ne filtre rien : `cancelled` passe dès
  que le client Prisma est régénéré. Un test d'aller-retour ligne → agrégat →
  ligne le tient.

**Les écrivains d'`order_collection`, un par un** (lus le 2026-10-12) :

| Écrivain                                                                                                        | Part de            | Peut-il croiser l'annulation ? Comment c'est tenu                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| constitution (`batch`, `exclude`)                                                                               | `due`, `excluded`  | **oui** — tenu par `lockAll` puis **relecture sous verrou** des commandes et de leur `order_collection` (C5.3). La version du 1ᵉʳ passage la disait fermée alors qu'elle gardait l'état lu avant le verrou : c'était faux                                                                                                                                        |
| `settle-order-otherwise` (`settleOtherwise`)                                                                    | `due`, `excluded`  | **oui**, avec l'annulation **et** avec la constitution (course préexistante, C5.1, 13) — `load` sans verrou puis `upsert`. **Prend désormais `OrderInvoicingLock.lock(orderId)` avant `load`** ; `load` relit par `billableOrderWhere` → annulée = `null` → refus existant ; et `close` l'aurait de toute façon rendue `cancelled`, que `settleOtherwise` refuse |
| `cancel-collection-batch` (`release`)                                                                           | `batched`          | non : l'annulation refuse `batched`. Si le lot est annulé pendant, l'annulation a relu `batched` sous son verrou → refus (sens sûr) ; elle repasse après                                                                                                                                                                                                         |
| `deposit-collection-batch` (`collect`)                                                                          | `batched`          | non (même raison)                                                                                                                                                                                                                                                                                                                                                |
| `record-collection-return`, `confirm-collection-return-import` (`bounce`, `collection-return-support.ts:49-54`) | `collected`        | non : jamais d'une ligne annulable                                                                                                                                                                                                                                                                                                                               |
| `represent-collection-return` (`represent`)                                                                     | `returned` → `due` | non : `returned` refusé ; après, `due` **avec rejet** → refus 5                                                                                                                                                                                                                                                                                                  |
| `write-off-collection-return` (`writeOff`)                                                                      | `returned`         | non                                                                                                                                                                                                                                                                                                                                                              |
| `settle-collection-return` (`settleReturned`)                                                                   | `returned`         | non                                                                                                                                                                                                                                                                                                                                                              |

Les écrivains par lot n'atteignent qu'une ligne vivante (`ofBatch`, `ofLine`) :
une `cancelled` n'a pas de `batch_id`, ils ne la voient jamais.

**Les lecteurs** :

| Lecteur                                                                                                                                          | Ce qu'il fait de `cancelled`                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `collectableOrders` (`isOpen`, `:178`)                                                                                                           | n'est pas ouverte → écartée (et la commande l'est déjà par l'assiette)                                                                                                         |
| `get-collection-preview` (même `readAssembly`, sans verrou)                                                                                      | idem : absente de l'aperçu                                                                                                                                                     |
| `buildStatements` (`billing-statement-support.ts:41`)                                                                                            | ne la voit jamais : elle n'est dans aucun débit                                                                                                                                |
| `invoice-dossier-support.ts`                                                                                                                     | ne lit pas `order_collection` (vérifié) : rien                                                                                                                                 |
| `prisma-cycle-orders.reader.ts` → `get-cycle-statement.handler.ts:101` (`collectionState`)                                                       | la commande sort de `billableOrderWhere` : jamais rendue                                                                                                                       |
| `ORDER_COLLECTION_STATE_LABELS` (`packages/contracts/src/collection-batch.ts:52`, `Record<OrderCollectionStateView, string>`)                    | **doit** gagner `cancelled` — le `Record` exhaustif ne compile pas sans (et c'est voulu)                                                                                       |
| front : `cycle-statement-card.ts:230` (indexe le `Record`) ; `shared/journal/values/accounting-values.ts:43-44` (ne nomme que `due`, `excluded`) | le premier suit le libellé ; le second n'a rien à faire (valeurs du journal de constitution). Aucun `switch` sur `OrderCollectionStateView` côté front (recensé le 2026-10-12) |
| `prisma-cycle-orders.reader.ts:69`                                                                                                               | ne la lit pas : la commande sort de `billableOrderWhere`                                                                                                                       |
| `prisma-collection-batch.reader.ts:118` (`exclusions`)                                                                                           | lit `state = excluded` : une fermée n'y est plus — c'est ce qu'on veut                                                                                                         |
| `prisma-detached-unpaid.reader.ts` (`excluded / payer_detached`)                                                                                 | idem : n'y est plus. Le trou du 1ᵉʳ passage (annulée affichée comme impayé) est fermé par l'état                                                                               |
| `collection-return-support.ts` (`ofLine`)                                                                                                        | ne la voit pas (pas de ligne)                                                                                                                                                  |
| `PrismaOrderCollectionRepository.load`                                                                                                           | rend `null` (assiette)                                                                                                                                                         |

#### C5.5 Le port côté commande

```ts
type AccountOrderEngagement =
  | { kind: "free" }
  | { kind: "invoiced"; invoiceNumber: string; issuedOn: string }
  | {
      kind: "collecting";
      state: "batched";
      collectionDay: string | null;
      statementNumber: string | null;
    }
  | { kind: "collected"; state: "collected" | "returned"; collectionDay: string | null }
  | { kind: "written_off" }
  | { kind: "returned_before" } // re-présentée (C5.2, 5)
  | { kind: "settled_otherwise" };
```

**`returned_before` se lit étroitement** : `billing_statement_order (order_id)`
→ `billing_statement` **`status = active`** → la ligne `(batch_id, line_rank)`
→ un `collection_return` sur son `end_to_end_id`. Le relevé ne porte que les
bons du débit de sa ligne (C5.1, 14) : un rejet ainsi trouvé est bien un rejet
**de cette commande**. Les relevés `cancelled` sont exclus : ce sont des lots
annulés avant dépôt, sans retour possible. Un bon réglé par une ligne de
**factures** n'a pas de relevé — il est alors facturé et tombe en 3.

`CancellationState` gagne `engagement: AccountOrderEngagement | null`.
**`null` n'est admis que hors régime `account`** ; pour `account`, `null` est
une incohérence et `cancellationOf` rend un bloc `engagement_unknown` (refus),
jamais « annulable » (S6). Le contrôle **hors verrou** de
`cancel-order.handler.ts:98/106` lit donc aussi l'engagement pour `account` —
même port de lecture — et refuse tôt sans rien toucher ; la relecture sous
verrou reste l'autorité.

`CancellableRegime` gagne `"account"` ; le bloc `{ kind: "account" }` et sa
phrase `:164` disparaissent. `cancel()` gagne son troisième `updateMany`
(`not_required ∧ totalCents > 0`, règlement inchangé), disjoint des deux autres.

#### C5.6 Les refus nommés

| Bloc                 | Phrase (`BusinessError` 409, code `orders.cancel.<bloc>`)                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invoiced`           | « Cette commande a été facturée le JJ/MM/AAAA (facture n° F…). Une facture émise ne s'efface pas : il faut un avoir, que l'équipe ne peut pas encore émettre ici. Voyez avec la comptabilité. » |
| `collecting`         | « Cette commande est dans le lot de prélèvement du JJ/MM/AAAA (relevé n° …). Annulez d'abord ce lot depuis la comptabilité s'il n'est pas déposé, puis revenez ici. »                           |
| `collected`          | « Cette commande a déjà été prélevée (lot du JJ/MM/AAAA). L'annulation avec remboursement n'existe pas encore : voyez avec la comptabilité. »                                                   |
| `written_off`        | « Cette commande a été passée en perte après un rejet de prélèvement. Elle ne s'annule pas : voyez avec la comptabilité. » (sans date : la ligne n'en garde pas)                                |
| `returned_before`    | « Le prélèvement de cette commande a déjà été rejeté par la banque puis représenté. L'annulation d'une commande représentée n'existe pas encore : voyez avec la comptabilité. »                 |
| `settled_otherwise`  | « Cette commande a été réglée hors prélèvement. L'annulation avec remboursement n'existe pas encore : voyez avec la comptabilité. »                                                             |
| `engagement_unknown` | « L'état de facturation de cette commande n'a pas pu être lu : rien n'a été annulé. Signalez-le à l'équipe technique. »                                                                         |

Une date absente s'écrit sans date, jamais inventée.

#### C5.7 Ce que devient la commande, et les autres blocs

- **Commande** : `cancelled`, règlement inchangé, colonnes de C3.5. **Aucun
  appel Stripe** : `closeIntent` n'est appelé que pour `due` (garde éprouvée).
- **`order_collection`** : `cancelled` (C5.4). **Facture, relevé, avis** :
  aucun (refusés en amont).
- **Fournil** : C3 tel quel ; « inscrite » sera le refus le plus fréquent.
- **Bon** : C3b tel quel (total > 0, donc `reinstate` rend ou refond).
- **Croissance** : abonné existant, inchangé.
- **Journal** `order.cancelled` : la charge porte le régime ; `account`
  s'ajoute. 🔴 **Une valeur de charge écrite en base ne se renomme que par
  migration de données** (CLAUDE.md §8, exceptions) : `account` est
  **irréversible** dès la première annulation en production. Le nom est
  celui de `settlementRegimeOf` ; on ne l'invente pas.
- **Courriel** `customer.order-cancelled`, variante `account` en fr/en/it :
  « Rien ne sera facturé ni prélevé pour cette commande. »

#### C5.8 L'écran

Rien de neuf : le bouton et la confirmation de C3 lisent `cancellability`,
désactivé avec la phrase de C5.6, confirmation avec la phrase du courriel
`account`. La comptabilité affiche l'état `cancelled` par son libellé.

#### C5.9 Les tests

- **domaine** : `cancellationOf` par `account` × chaque engagement × inscrite ;
  `account` + `null` → `engagement_unknown` ; ordre des refus ; `close` depuis
  `due`/`excluded`, refusé ailleurs ; **chaque** transition refuse
  `cancelled` (neuf tests) ; groupe de facture filtré : clé inchangée, vide →
  rien.
- **application** : pas d'appel au prestataire pour `account` ; engagement lu
  hors verrou puis sous verrou ; `closeForCancellation` dans l'unité de
  travail ; refus comptable → ni `withdraw`, ni `reinstate`, ni fait.
  `settle-order-otherwise` : verrou pris avant `load`.
- **e2e** (`--runInBand`) :
  - **annulation × émission**, deux ordres, barrière entre `prepare` et
    `issueFor` ; un bon `unbillable` annulé n'est plus signalé ;
  - **annulation × constitution**, deux ordres, barrière entre
    `collectableOrders` et `lockAll` ; l'aperçu, lui, ne bloque pas une
    annulation concurrente ;
  - **annulation × réglée autrement**, deux ordres → jamais `settled_otherwise`
    sur une annulée ;
  - **réglée autrement × constitution**, deux ordres, barrière entre
    `collectableOrderIds` et `lockAll` → une réglée n'entre jamais au lot
    (**régression** : la course préexistait à C5, C5.1, 13) ;
  - `returned_before` : un rejet sur la ligne d'un **autre** bon du même payeur
    ne bloque pas ; un relevé `cancelled` ne compte pas ;
  - mapper : `cancelled` fait l'aller-retour ;
  - **pas d'interblocage** : annulation, émission, constitution, ensemble, dix
    fois → aucun `40P01` ;
  - ids choisis pour que l'ordre `en_US` et l'ordre binaire diffèrent (minuscule
    et majuscule si un id de test le permet) → même ordre des deux côtés ;
  - lot annulé avant dépôt → l'annulation passe ; re-présentée → refus
    `returned_before` ; `collected`/`written_off`/`settled_otherwise` → refus ;
  - annulée → `order_collection.state = cancelled`, absente de l'émission, de
    la constitution, des exclusions, des impayés détachés ;
  - bon rendu (C3b) ; courriel `account` une fois ; journal régime `account` ;
  - cohérence : toute `batched` a un `billing_statement_order` sous un relevé
    `active` de sa ligne.

#### C5.9 bis Questions pour Hugo — choix métier, défauts appliqués

Non tranchées par Hugo au 2026-10-12 ; le lot se bâtit sur les défauts.

1. 🟠 **MÉTIER — lot non déposé.** Le refus dit « annulez d'abord le lot »,
   qui le retire pour tous ses payeurs. **Défaut** : refus. Plus tard : un
   geste « retirer une commande d'un lot non déposé » ?
2. 🟠 **MÉTIER — commande facturée.** **Défaut** : refus ; l'avoir sur facture
   mensuelle rejoint C4.
3. 🟠 **MÉTIER — commande re-présentée après un rejet bancaire (S4).**
   **Défaut** : refus. Plus tard : l'annuler en clôturant son retour ?

#### C5.10 Sort des objections de `vitruve` (2026-10-12)

| #      | Objection                                      | Sort                                                                                         |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| B1     | filtre après `readAssembly`, trop tard         | **réglée** : `lockAll` + relecture **dans** `readAssembly`, mode constitution (C5.3)         |
| B2     | `order_collection` laissée ouverte, écrasable  | **réglée** : état terminal `cancelled`, écrit dans la transaction (C5.4)                     |
| S3     | replanifier change le groupe                   | **réglée** : filtre du seul groupe, clé stable par `effectiveMandateOf` (C5.1, 3 ; C5.3)     |
| S4     | `due` re-présentée                             | **défaut** : refusée, question métier (C5.2, 5 ; C5.9 bis, 3)                                |
| S5     | écrivains et lecteurs non recensés             | **réglée** : recensés (C5.4) ; `settle-order-otherwise` prend le verrou                      |
| S6     | contrôle hors verrou aveugle à l'engagement    | **réglée** : lu aussi hors verrou ; `account` + `null` refusé (C5.5)                         |
| S7     | deux mécanismes d'ordre, collation             | **réglée** : un adaptateur, `ORDER BY id COLLATE "C"` ; base en `en_US.utf8` (C5.1, 12)      |
| S8     | `account` dans la charge                       | **dit** : irréversible une fois en base (C5.7)                                               |
| m      | `written_off` daté ; `unbillable` hors verrou  | **réglées** (C5.6 ; C5.3)                                                                    |
| NV     | `InvoiceIssuer.issue`, verrous de C3           | **vérifiés** : compteur seul ; journée et titulaire sans ligne `orders` (C5.1, 2 et 11)      |
| B (2ᵉ) | état d'encaissement lu avant `lockAll`, écrasé | **réglée** : ids, verrou, relecture sous verrou (C5.3) ; course préexistante dite (C5.1, 13) |
| S (2ᵉ) | relevé trop large, lecteurs incomplets         | **vérifié** : relevé = bons débités ; `active` seul ; lecteurs complétés (C5.1, 14 ; C5.4)   |
| m (2ᵉ) | `outcomeKey`, mapper                           | **réglées** (C5.3 ; C5.4)                                                                    |

### Lot C4 — annuler une commande PAYÉE par carte, avec remboursement (conçu le 2026-10-12, contredit, révisé)

> Hugo, 2026-10-12 : « je pense que souvent l'annulation aura lieu post
> paiement », « il faudra adapter les comportements de remboursement en
> fonction des cas de figure ». Enchaînement sans arrêt : les questions
> techniques sont tranchées ici ; les choix métier sont en C4.10, **chacun
> avec un défaut prudent que le lot applique**.

📐 **Plan.** Touche **l'argent** (un remboursement Stripe est **irréversible**)
et porte une **migration** : contredit par `vitruve` le 2026-10-12 (2 BLOQUANT,
6 SÉRIEUX, intégrés dans le corps et en C4.11 bis),
`lecteur-de-migrations` au bâti. Reprend C3 (route, droit `b2b_cancel_order`,
retrait au fournil, transaction, fait durable, courriel) et C3b (le bon) tels
quels ; n'ajoute que **l'argent à rendre**. Indépendant de C5 : les deux
élargissent `CancellableRegime` et `cancel()` d'une branche disjointe.

#### C4.1 Ce que le code dit — ouvert le 2026-10-12

1. **La passerelle ne sait pas rembourser.** `PaymentGateway`
   (`b2b/payments/domain/payment-gateway.ts`) a `createIntent`,
   `retrieveIntent`, `cancelIntent`, `parseWebhook` ; aucun `refund`.
   `stripe-payment-gateway.ts` n'emploie **aucune** clé d'idempotence
   aujourd'hui.
2. **Les remboursements sont déjà CONSTATÉS** (lot R1,
   `facture-carte-et-remboursements.md`) : `refund.created|updated|failed` →
   `RecordOrderRefundHandler` → agrégat `OrderRefundLedger`
   (`orders/domain/entities/order-refund-ledger.ts`), chargé par
   `loadByPaymentIntent` **sous `FOR UPDATE` de la ligne `orders`**.
   L'agrégat est idempotent par `stripe_refund_id` (`order_refund`, `@unique`),
   refuse un statut qui régresse, un montant changé, une autre devise, et
   **Σ `succeeded` > `chargedCents`** ; il passe `paid → refunded` quand le
   cumul atteint le total, et revient à `paid` si un réussi échoue. Un
   `succeeded` publie le fait durable `order.refund_succeeded`.
3. **Le montant encaissé est `orders.total_cents`**, déjà **net du bon**
   (`Order.place` : `computeOrderTotals(… voucherDiscountCents …)`) et
   **frais de livraison et surtaxe de retard compris** ; l'intention est
   dimensionnée dessus (`order-settlement.ts:50`). Rembourser `total_cents`
   ne rend donc **rien** de la part payée en bon.
4. **Une `paid` entre au plan dès l'encaissement** : `planWhere()` =
   `status ∈ STATUS_IN_PLAN ∧ paymentStatus ∉ {failed, refunded, pending}`
   (`plan-filter.ts:47`, `production-plan.ts:108,127`). Elle est donc
   **producible** pour son jour de service, et **inscrite à l'arrêt** de cette
   journée (clôture, ou retirage d'une journée close). Une `refunded` (rendue
   en entier depuis le tableau de bord Stripe) n'est **jamais** inscrite.
5. **Aucune facture carte ne peut exister sur une `paid` annulable.**
   `cardInvoiceVerdict` (`accounting/domain/services/card-invoicing.ts`) ne
   rend `issuable` que pour une commande **pro, encaissée ET retirée**
   (`handedOverAt` non nul). Seul `markFulfilled` écrit `handedOverAt`, et il
   passe la commande `fulfilled` dans la même écriture, sous `status <>
cancelled` (`prisma-order.repository.ts:342-358`, ouvert le 2026-10-12) :
   une commande retirée est `fulfilled`, refusée par C3.3, et une annulée ne
   l'est jamais — elle reste `not_card` pour toujours. Le particulier n'a
   jamais de facture carte.
6. **L'avoir suit déjà le remboursement** : `ReconcileRefundsOnRefund`
   (durable, sur `order.refund_succeeded`) émet l'avoir **s'il y a une facture
   carte**, rien sinon (`refund-reconciler.ts:64-67` rend 0 sans facture,
   relu le 2026-10-12) ; `RingRefundNotCredited` ne sonne que pour
   `account_invoice` / `exceeds_invoice`. Une annulée remboursée ne sonne donc
   pas.
7. **La croissance ne compte pas deux fois** : `revenue-scope.ts` exclut
   `cancelled` et `refunded`, et ne lit pas `order_refund` (vérifié le
   2026-10-09 dans le fichier, relu ce jour).
8. **« Encaissé après annulation »** : `settle()` refuse de rouvrir une
   annulée et publie `OrderPaidAfterCancellationEvent` ; `RingRefundDue`
   (durable) sonne « à rembourser depuis Stripe ». Le carnet, lui, laisse le
   règlement `failed` (`RefundSettlement`, `unchanged`).
9. **Le passage de nuit des reliquats** ne vise que les commandes `paid`
   vivantes (C3b.1) : une `paid` annulée après la nuit a un bon **soldé** —
   C3b le traite (cas 2, 3, 5, 6), relecture sous verrou déjà bâtie.
10. **Un abonné durable tourne dans la transaction de son reçu**
    (`durable-delivery-guard.ts:34-48`, `unit-of-work.ts:50`) : il ne peut
    pas porter un appel réseau (C4.7). Le cron de rafraîchissement appelle
    déjà des balayages (`container/worker.ts`, dont `admin/outbox/sweep`).
11. **`cancel()`** (`prisma-order-cancellation.repository.ts:57-69`) a deux
    `updateMany` disjoints (`due`, `free`) ; aucune branche `paid`.

#### C4.2 Le critère

Une commande de régime `paid` (`paymentStatus ∈ {paid, refunded}`) est
annulable **ssi** :

| #   | Condition                                  | Où                                                 |
| --- | ------------------------------------------ | -------------------------------------------------- |
| 1-2 | `placed` (inchangé)                        | `orders.status`                                    |
| 3   | **non inscrite au fournil** (C3, inchangé) | `OrderWithdrawalDesk.withdraw`, sous verrou        |
| 4   | **aucun remboursement en vol** (C4.4)      | `order_refund` : aucun `pending`/`requires_action` |
| 5   | bon : C3b tel quel                         | `LoyaltyVoucherRedemption.reinstate`               |

**Concrètement, une commande payée s'annule de son paiement jusqu'à l'arrêt
de sa journée de service** (C4.1, 4) — le soir d'avant, à l'heure de l'arrêt
automatique, ou plus tôt si l'équipe arrête à la main. Après l'arrêt : refus
« inscrite » (C3.7), inchangé ; annuler une commande fabriquée est hors de ce
lot (C4.10, Q4). Une `paid` sans jour de service n'est jamais producible : rien
à retirer.

`refunded` (rendue en entier depuis Stripe avant l'annulation) est annulable
**sans** remboursement : il n'y a plus rien à rendre (C4.4).

#### C4.3 L'ordre des gestes — la base d'abord, Stripe ensuite

**L'inverse de C3.** Pour fermer une intention, Stripe d'abord : l'échec
Stripe n'écrit rien, et le geste est réversible des deux côtés. Un
**remboursement ne se reprend pas** : le faire avant la transaction rendrait
l'argent d'une commande que le fournil vient d'inscrire (refus 3 sous verrou)
ou dont le bon refuse (C3b cas 5-6) — de l'argent rendu pour une commande
fabriquée. C'est B2/B3 (§9.1) : **l'argent à rendre devient un état persisté,
écrit dans la transaction de l'annulation** ; Stripe vient après, rejouable.

```mermaid
sequenceDiagram
  participant S as Staff
  participant C as CancelOrderHandler
  participant DB as Postgres
  participant X as IssueOrderRefund (exécuteur)
  participant ST as Stripe
  S->>C: POST /admin/orders/:id/cancel
  C->>C: cancellationOf (hors verrou)
  C->>DB: UNE transaction : orders FOR UPDATE → retrait fournil → cancel()<br/>→ reinstate(bon) → INSERT order_refund_request → order.cancelled (durable)
  DB-->>C: COMMIT
  C-->>S: 204
  Note over X: déclenché par (a) deferUntilCommit, (b) balayage cron, (c) « Relancer »
  X->>DB: transaction courte : prendre le bail (claimed_until)
  X->>ST: refunds.list (métadonnée) puis, si rien, refunds.create (clé, sans amount)
  ST-->>X: re_… | refus | panne
  X->>DB: transaction courte : carnet.record(re_…) sous orders FOR UPDATE,<br/>attempts, round, next_attempt_at, bail relâché, cloche, journal
  ST-)DB: webhook refund.updated → carnet (déjà connu : stale ou transition)
```

1. Hors verrou : `cancellationOf` (régime `paid` admis) ; aucun appel
   Stripe — **`closeIntent` ne s'appelle que pour `due`**, garde inchangée.
2. Transaction, ordre de C3.4 ter : `orders FOR UPDATE` → relire → retrait
   au fournil → `cancel()` (3ᵉ branche, C4.6) → `reinstate` (C3b) → **la
   demande de remboursement** (C4.5), montant calculé **sous ce verrou** sur
   le carnet relu → `order.cancelled` (régime `paid`, `refund` renseigné),
   durable. **Aucun fait ne porte l'appel à Stripe** : la demande persistée
   est la file.
3. Après `COMMIT`, `deferUntilCommit` lance l'exécuteur (C4.7) en
   `BackgroundWork` — best effort, sans relance. S'il n'aboutit pas, le
   balayage du cron le reprend ; le bouton aussi.
4. La réponse au staff est `204` dès la transaction validée : **l'annulation
   est faite**, le remboursement est **demandé**. Aucune latence n'est
   promise : l'écran dit « demandé » tant qu'il n'y a pas de `re_…` (C4.9).

**Le rejeu de transaction de C3.4 ter ne s'applique pas** : il n'existe que
parce que Stripe a déjà agi. Ici Stripe n'a rien fait ; un échec de
transaction rend une erreur simple, rien n'est écrit, le staff relance.

#### C4.4 Le montant

**Défaut appliqué (Q1) : remboursement intégral de ce qui a été encaissé par
carte et pas encore rendu** — produits, frais de livraison et surtaxe de
retard compris : avant l'arrêt, rien n'est fabriqué ni chargé.

```
à rendre = chargedCents − Σ order_refund.amount où status = succeeded
```

- lu **sous le verrou de la ligne `orders`**, le même que `loadByPaymentIntent`
  : un webhook de remboursement concurrent attend ;
- seul `succeeded` compte : un remboursement en vol (`pending`,
  `requires_action`) **refuse** l'annulation avant ce calcul (C4.2, 4, bloc
  `refund_in_flight`) — sinon son échec ultérieur laisserait un reste que
  personne ne rend. Phrase : « Un remboursement de X € est en cours chez
  Stripe sur cette commande. Attendez son issue, puis annulez. » ;
- `= 0` (déjà rendue en entier, ou `refunded`) → annulée **sans** demande ;
  courriel variante « déjà remboursée » ;
- **la part payée en bon n'est jamais remboursée en argent** :
  `total_cents` est déjà net du bon (C4.1, 3) ; le bon suit C3b ;
- un remboursement partiel antérieur (tableau de bord) : on rend le reste.

🔴 **Ce qui protège l'argent est l'appel sans `amount`** : Stripe ne rend
jamais plus que le reste remboursable de l'intention. Le bail, la clé, la
recherche et le carnet évitent un second appel ou un double constat ; aucun
d'eux n'est la dernière défense contre un sur-remboursement — celle-ci est
chez Stripe, par construction de l'appel.

**Stripe rembourse le reste, pas un montant que nous lui imposons.** L'appel
ne passe **pas** `amount` : Stripe rend ce qui reste remboursable sur
l'intention. Un remboursement partiel fait depuis le tableau de bord **entre**
notre calcul et notre appel ne peut alors pas faire déborder (Stripe refuserait
un montant supérieur au reste) ; le montant **émis** est celui que Stripe
rend, consigné par le carnet, qui tient le plafond. Si l'émis diffère de
l'annoncé, le journal porte les deux (C4.8). Le montant annoncé reste celui
de la demande.

#### C4.5 L'état persisté : `order_refund_request`

Table neuve, schéma `public`, possédée par `b2b/orders`. Migration
**additive** :

| Colonne            | Type                      | Rôle                                                                                                                                       |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `order_id`         | `text` PK, FK `orders`    | **une demande par commande** — le second clic ne peut pas en écrire une seconde                                                            |
| `cause`            | enum `OrderRefundCause`   | `cancellation` \| `paid_after_cancellation` (C4.11)                                                                                        |
| `announced_cents`  | `int` `CHECK > 0`         | ce que l'annulation a promis                                                                                                               |
| `requested_at`     | `timestamptz(3)`          | `Clock`                                                                                                                                    |
| `requested_by`     | `text` nullable           | id staff interne (jamais un `sub`) ; nul pour une cause automatique                                                                        |
| `generation`       | `int` défaut 1            | entre dans la clé d'idempotence ; +1 seulement quand un remboursement émis **échoue** (C4.7)                                               |
| `stripe_refund_id` | `text` nullable unique    | le `re_…` de la génération courante                                                                                                        |
| `issued_at`        | `timestamptz(3)` nullable | quand Stripe l'a accepté                                                                                                                   |
| `attempts`         | `int` défaut 0            | appels faits pour la génération                                                                                                            |
| `last_failure`     | `text` nullable           | code lisible (`unavailable`, `declined:<code Stripe>`), jamais un message brut au client                                                   |
| `last_attempt_at`  | `timestamptz(3)` nullable |                                                                                                                                            |
| `round`            | `int` défaut 1            | entre dans la clé ; +1 après une issue `unavailable` si la recherche par métadonnée n'a rien trouvé (C4.7) ; remis à 1 à chaque génération |
| `claimed_until`    | `timestamptz(3)` nullable | bail de l'exécuteur : un seul à la fois, 5 min (C4.7)                                                                                      |
| `claim_token`      | `text` nullable           | jeton du porteur du bail (ULID) : seul lui relâche et écrit l'issue (C4.7)                                                                 |
| `next_attempt_at`  | `timestamptz(3)` nullable | quand le balayage peut la reprendre : `requested_at` à la création, puis la courbe de `retry-policy.ts` ; nul après `declined`             |

`CHECK ((stripe_refund_id IS NULL) = (issued_at IS NULL))`. **Aucun statut
stocké** : l'état se lit (règle pure `refundRequestStateOf(request, ledger)`)
— `to_issue` (pas de `re_…`), `issued` (le `re_…` est `pending` au carnet),
`refunded` (`succeeded`), `failed` (`failed`/`canceled` → la prochaine
génération est due). L'argent vrai reste au carnet ; la demande ne dit que
**ce qui a été promis et ce qui a été tenté**. Deux sources qui pourraient
diverger sur le statut, c'est exactement ce qu'on évite.

Agrégat `OrderRefundRequest` (`orders/domain/entities/`) : `request(…)`
(factory, refuse `announced ≤ 0`), `attempted(at, failure)`,
`issued(refundId, at)` (refuse si déjà émis pour la génération),
`reopenAfterFailure(ledger)` (seulement si le `re_…` courant est
`failed`/`canceled` au carnet → `generation + 1`, `re_…` et `issued_at` à
nul). Port `OrderRefundRequestRepository` `load`/`save` ; `save` conditionné
à la génération chargée (une écriture concurrente lève, rejouable — le geste
de C3b.2).

**Pas de valeur ajoutée à `PaymentStatus`** (le `voided` du §2 D5 reste
abandonné, S7) : une annulée remboursée finit `cancelled` + `refunded` par le
carnet ; en attente, `cancelled` + `paid` **avec une demande** — l'écran et
la cloche lisent la demande, pas le statut.

#### C4.6 La transaction d'annulation

- `CancellableRegime` gagne `"paid"` ; le bloc `{ kind: "paid" }` et sa phrase
  (`order-cancellation.ts:100`, `:169`) disparaissent ; bloc neuf
  `refund_in_flight { amountCents }` ; l'issue `already_paid` de `cancelIntent`
  (une `due` encaissée pendant le clic) lève le bloc neuf `paid_just_now`.
  `CancellationState` gagne
  `refunds: { refundableCents; inFlightCents }`, lus par
  `CancellationSubjectReader` (sans verrou) et par `lock()` (sous verrou).
- `cancel()` gagne sa 3ᵉ branche, disjointe :
  `where { id, status: placed, paymentStatus: { in: [paid, refunded] } }`,
  **règlement inchangé** (le carnet le fera passer `refunded`).
- Puis, si `refundableCents > 0` : `OrderRefundRequest.request(…)` et `save`,
  **dans la même unité de travail** (aucun fait d'appel : la demande est la
  file, C4.7). Échec d'insertion (PK) : impossible sous le
  verrou de la ligne `orders` après un `cancel()` qui a franchi ; s'il
  survenait, tout s'annule.
- **Ordre des verrous inchangé** : `orders` → journée → titulaire du bon. La
  demande est sur `orders` (même ligne déjà tenue) ; `order_refund_request`
  n'est verrouillée par personne d'autre avant `orders`.

#### C4.7 Émettre le remboursement — `IssueOrderRefundCommand`

Un seul handler, **jamais exécuté dans une transaction ni dans un abonné
durable**. Un abonné durable tourne dans la transaction de son reçu
(`durable-delivery-guard.ts:34-48` ; l'unité de travail rejoint la
transaction en cours, `unit-of-work.ts:50`) : Stripe y serait appelé sous
transaction, et une levée effacerait le nombre d'essais, la cloche et le
journal de l'échec (`vitruve`, BLOQUANT 1). Commande + handler séparés (B2B).

**Trois déclencheurs** :

- (a) `deferUntilCommit` après l'annulation ;
- (b) `POST /admin/orders/refunds/sweep` sur le cron de rafraîchissement
  (`container/worker.ts`, par `postSweep` comme `admin/outbox/sweep`,
  `:389`), gardé comme lui : `@Public()` + `RecomputeGuard`
  (`outbox-sweep.controller.ts:18-20`, même jeton machine). Il prend au plus
  **20 demandes par passage**, sans `re_…`, dont `next_attempt_at ≤ maintenant`,
  par ordre de `next_attempt_at` ; le reste attend le passage suivant ;
- (c) le bouton « Relancer » : la route **n'attend pas Stripe** — elle vérifie
  le droit et l'état, déclenche l'exécuteur par `deferUntilCommit` et rend
  `202` ; l'écran relit.

**Le temps de l'exécuteur n'est pas le `now` de la requête.** `SystemClock`
rend l'instant **gelé à l'ingress** dès qu'un `RequestContext` existe
(`platform/time/system-clock.ts:20-25`), et ce contexte suit les
continuations asynchrones — donc le balayage et le bouton. Un bail ou une
échéance calculés dessus seraient en retard de toute la durée de l'appel
Stripe. Aucun port d'horloge murale n'existe (`platform/time/` : `clock.ts`,
`fixed-clock.ts`, `system-clock.ts`, lu le 2026-10-12). **Port neuf
`WallClock`** (`platform/time/wall-clock.ts`, `elapsedNow(): Date`),
adaptateur `SystemWallClock`, `FixedWallClock` en test ; il ne sert **qu'à**
mesurer un bail et une échéance de reprise — jamais un instant métier
(`requested_at`, `issued_at`, le journal restent au `Clock`). Inscrit dans
les dérogations de `lint:clock-port` (`dev-toolbox/gates/clock-port.mjs`)
avec cette raison.

**Le bail est plus long que l'appel le plus long.** L'appel de remboursement
passe ses options par requête — `{ timeout: 20_000, maxNetworkRetries: 2 }`
— au lieu des défauts implicites du client (`new Stripe(secretKey)` sans
options, `stripe-payment-gateway.ts:45`) ; les autres appels ne changent
pas. Pire cas : recherche + création, chacune 3 × 20 s plus l'attente entre
reprises du SDK, soit moins de 3 min. **Bail : 5 min.** (Options par
requête, reprises du SDK : documentation Stripe, non vérifiable dans le
dépôt.)

**Le port** — `PaymentGateway.refundRemainder(params)` :

```ts
interface RefundRequestParams {
  readonly paymentIntentId: string;
  /** `lfd-order-refund:<orderId>:<generation>:<round>` — clé Stripe. */
  readonly key: string;
  /** Métadonnées posées sur le `re_…` et filtrées par la recherche. */
  readonly requestId: string; // = orderId (PK de la demande)
  readonly generation: number;
}
type RefundIssuance =
  | { kind: "issued"; report: RefundReport } // re_…, montant, statut, instant Stripe
  | { kind: "nothing_left" } // charge_already_refunded
  | { kind: "declined"; code: string } // refus Stripe définitif (litige, etc.)
  | { kind: "unavailable"; reason: string }; // réseau, 5xx, canal non configuré
```

Ne lève jamais (comme `cancelIntent`). Implémentation :

1. **chercher d'abord** : `refunds.list({ payment_intent, limit: 100 })`,
   paginé, et retenir celui dont `metadata.lfd_refund_request` est la demande
   **et** `metadata.lfd_generation` la génération courante, **et** dont le
   statut n'est ni `failed` ni `canceled` → `issued` avec lui. Un `re_…`
   d'une génération précédente, ou échoué, n'est **jamais** retenu : sans ce
   filtre, « Relancer » après un échec retrouverait l'ancien et ne
   rembourserait jamais (`vitruve`, 2ᵉ passage). Tous rounds confondus : c'est
   ce qui rend le rejeu sûr au-delà de la durée où Stripe garde une clé, et
   après un `COMMIT` perdu ;
2. sinon `refunds.create({ payment_intent, metadata: { lfd_refund_request,
lfd_generation, lfd_order_id },
reason: "requested_by_customer" }, { idempotencyKey: key })`,
   **sans `amount`** (C4.4) ;
3. `charge_already_refunded` → `nothing_left` ; `idempotency_key_in_use`
   (409) → `unavailable`, **jamais** `declined` ; un autre
   `StripeInvalidRequestError` / `StripeCardError` → `declined` avec son
   `code` ; réseau, 5xx, 429 → `unavailable`.

⚠️ **Documentation Stripe, non vérifiable dans le dépôt** (aucun appel avec
clé n'y existe aujourd'hui) : deux requêtes simultanées sur la même clé, la
seconde reçoit `409 idempotency_key_in_use` ; Stripe garde **24 h** le
résultat d'une clé, **500 compris**, et le rend à l'identique. D'où le bail
(pas de requêtes simultanées) et le `round` (une 500 ne se rejoue pas sous
sa clé). À éprouver sur le mode test de Stripe au bâti.

Le parent n'appelle jamais Stripe sous un verrou de base.

**Le handler** :

1. **prendre le bail**, transaction courte validée : `updateMany where {
order_id, OR: [claimed_until null, claimed_until < wall.elapsedNow()] }`
   → `claimed_until = elapsedNow + 5 min`, `claim_token = ids.next()`. `0`
   ligne → un autre exécuteur la tient : rien. État `refunded`/`issued` →
   relâcher, rien. `failed` → `reopenAfterFailure` (génération + 1,
   `round` = 1) ;
2. **hors de toute transaction** : `refundRemainder({ intent, orderId,
key(generation, round) })` — recherche, puis création ;
3. **transaction courte** : `loadByPaymentIntent` (verrou `orders`), puis
   **relire la demande sous ce verrou** ; si son `claim_token` n'est plus le
   nôtre ou sa génération a changé (bail expiré, repris ailleurs), ne rien
   écrire de la demande — le constat au carnet reste fait, il est idempotent.
   `save` est conditionné par **jeton + génération**. Puis selon l'issue — **aucune ne lève**, chacune laisse sa trace :
   - `issued` → `ledger.record(report)` (**exactement** ce que fait le
     webhook) ; refus si le `re_…` appartient à une autre commande ;
     `request.issued(re_…)` ; journal du carnet (`recordedFacts`) ;
     `order.refund_succeeded` si `succeeded` ;
   - `nothing_left` → **refaire la recherche** (même filtre) et relire le
     carnet : si un `re_…` de la génération existe, c'est `issued` ; si le
     carnet dit le reste nul (remboursé ailleurs, webhook arrivé), la
     demande se lit `refunded` (C4.5 : l'état se lit au carnet) — l'écran ne
     dit jamais « à faire » quand le carnet dit remboursé. Sinon (Stripe dit
     tout rendu, le carnet ne le sait pas : webhook manquant)
     `attempted(…, "nothing_left")`, `next_attempt_at` nul, journal, cloche
     « Rien à rembourser chez Stripe — vérifier le tableau de bord » ;
   - `declined` → `attempted(…, "declined:<code>")` ; journal ; cloche
     « Remboursement refusé par Stripe » ; `next_attempt_at` nul (le
     balayage ne la reprend pas : rejouer ne change rien) ;
   - `unavailable` → `attempted(…, "unavailable")`, `round + 1`,
     `next_attempt_at` = `elapsedNow` + la courbe de `retry-policy.ts` ; journal
     `order.refund_attempt_failed` ; cloche au **premier** échec de la
     génération (clé par commande et génération) ;
   - **`RefundRejectedError`** levée par `ledger.record` (devise, montant
     changé, `exceeds_charge`, régression) : attrapée **comme le webhook**
     (`record-order-refund.handler.ts:94-110`) — journal `rejectedFact`,
     `OrderRefundRejectedEvent` (cloche existante), `attempted(…,
"rejected:<raison>")`, `next_attempt_at` nul : plus de rejeu
     automatique, le bouton reste ;
   - dans tous les cas : bail relâché **si le jeton est le nôtre**.

Un `COMMIT` du 3. qui échoue après un `re_…` créé : le bail expire,
l'exécuteur suivant retrouve le `re_…` par la recherche du 2. — jamais un
second.

**Le webhook avant notre écriture** (`refund.created` arrive avant que la
transaction du 3. valide) : le carnet l'a déjà enregistré ; notre `record`
rend `unchanged` ; `issued()` pose l'id. **Le webhook après** : transition
`pending → succeeded`, `order.refund_succeeded`, comme aujourd'hui. Le
carnet est la seule écriture de l'argent ; aucun chemin ne compte deux fois.

**Remboursement émis puis `failed`** (webhook `refund.failed`, carte fermée) :
le carnet l'enregistre (aujourd'hui). Un abonné neuf, sur un fait
`order.refund_failed` publié par `RecordOrderRefundHandler` **quand une
demande existe pour la commande**, sonne « Remboursement échoué chez Stripe —
à traiter » ; l'état lu devient `failed` ; « Relancer » ouvre la génération
suivante. **Pas** de relance automatique (Q3) : une carte fermée refusera
encore, et la sortie (virement) est un geste humain.

#### C4.8 Journal, courriel, cloche

- **`order.cancelled`** : `regime` gagne `"paid"` — 🔴 **irréversible** dès la
  première en production (§8, valeurs du journal ; même mise en garde que
  C5.7) ; charge gagne `refund: null | { announcedCents }`. Le contrat
  (`journal-facts/orders-production.ts`), la phrase du back-office et
  `key-labels.ts` suivent. Remplacement additif : C3 n'est pas sur `main`
  (C3b.6) — si C3 part avant C4, `refund` absent se lit `null`.
- **Les faits de l'argent** : ceux du carnet (`recordedFacts`, inchangés) ; neufs
  `order.refund_attempt_failed { generation, failure }` (`Journal.append`, la
  trace d'un argent non rendu doit être opposable), et `order.refund_issued
{ announcedCents, issuedCents, refundId }` quand l'émis diffère de
  l'annoncé.
- **Courriel** `customer.order-cancelled`, variante `paid`, fr/en/it, **à
  l'annulation** (la promesse est vraie même si Stripe hoquette : la demande
  est persistée et rejouée) :
  « Le montant de 23,40 € payé par carte vous sera remboursé sur cette même
  carte. Selon votre banque, il apparaît sous 5 à 10 jours ouvrés. » ;
  variante `refunded`/reste nul : « Le paiement de cette commande vous a déjà
  été remboursé. » ; plus la phrase du bon de C3b.8. **Aucun second
  courriel** au remboursement réussi (Q2).
- **Cloche** `order.refund_attention`, sans destinataire nommé (comme
  `RingRefundDue`), clé `notification:order.refund_attention:<orderId>:<generation>:<cause>`,
  lien `/commandes/:id` : `unavailable` (premier échec), `declined`,
  `nothing_left`, `failed` (webhook). Aucune cloche quand tout va bien.

#### C4.9 L'écran et les routes

- `AdminOrderCancellability` (forme `cancellable: true`) gagne
  `refund: null | { amountCents; sentence }` : « Le client sera remboursé de
  23,40 € sur sa carte (livraison comprise). Le remboursement part
  automatiquement chez Stripe après l'annulation. » ; avec reste nul : « Le
  paiement a déjà été remboursé en entier depuis Stripe : rien ne partira. »
  La confirmation en ligne affiche `voucher.sentence` puis `refund.sentence`.
- `GET /admin/orders/:id` gagne `refund: null | AdminOrderRefund` :
  `{ state: "to_issue" | "issued" | "refunded" | "failed"; announcedCents;
issuedCents | null; requestedAt; issuedAt | null; lastFailure: string | null
(phrase du serveur) ; retryable: boolean }`, lu par une query
  (`refundRequestStateOf` + carnet). Bandeau sur le détail d'une annulée :
  « Remboursement de 23,40 € — envoyé à Stripe le 12/10 à 14:03, en attente
  de la banque » / « remboursé le … » / « **à faire** : Stripe n'a pas répondu
  (3 essais). » + bouton « Relancer le remboursement ».
- `POST /admin/orders/:id/refund/retry`, **`202`**,
  `@RequirePermission("b2b_cancel_order:write")` (le droit qui a créé la
  demande ; pas de ressource neuve). Elle **n'appelle pas Stripe** : refus
  nommés (pas de demande — 404 métier ; déjà remboursé ; bail tenu, « Stripe
  traite déjà ce remboursement »), sinon `next_attempt_at` = maintenant
  (horloge murale) et déclenchement de l'exécuteur après validation ;
  l'écran relit.
- **Liste** `/commandes` : un filtre « remboursement à faire » (états
  `to_issue` avec `attempts > 0`, et `failed`) — l'écran « à régulariser »
  de §9.1, rendu par une lecture, pas par une table de plus.

#### C4.10 Questions pour Hugo — choix métier, défauts appliqués

Non tranchées au 2026-10-12 ; le lot se bâtit sur les défauts.

1. 🟠 **Combien rendre ?** **Défaut : tout ce qui a été encaissé par carte**,
   livraison et surtaxe de retard comprises (rien n'est fabriqué ni chargé
   avant l'arrêt). Plus tard : une retenue (frais de livraison gardés si
   l'annulation vient du client tard, par exemple) — ce serait un montant
   choisi à l'écran, et le port devrait alors passer `amount`.
2. 🟠 **Prévenir le client quand l'argent est parti ?** **Défaut : non** — le
   courriel d'annulation l'annonce déjà ; un second courriel dirait « c'est
   parti » sans que la banque l'ait crédité.
3. 🟠 **Remboursement refusé ou échoué chez Stripe** (carte fermée, litige) :
   **défaut : cloche + bouton, aucune relance automatique**, l'équipe règle
   à la main (virement) — le système ne sait pas encore noter un
   « remboursé autrement ». Plus tard : ce geste, sur le modèle de
   `settle-order-otherwise`.
4. 🟠 **Annuler après l'arrêt** (commande inscrite, donc fabriquée) :
   **défaut : refus, inchangé**. Plus tard : un remboursement **sans**
   annulation de production (geste commercial), qui est un autre lot.
5. 🟠 **Encaissé après annulation** (C4.1, 8) : **défaut : rembourser
   automatiquement**, par le même mécanisme (C4.11) — la commande est annulée
   et ne sera pas produite, l'argent n'est pas à nous. Alternative : garder la
   cloche manuelle d'aujourd'hui.

#### C4.11 L'encaissé après annulation, par le même chemin (défaut de Q5)

`RingRefundDue` est **remplacé** par l'abonné durable
`orders.refund-paid-after-cancellation` sur
`order.paid_after_cancellation` : dans une unité de travail, verrou `orders`,
carnet relu, `OrderRefundRequest.request({ cause: paid_after_cancellation,
requested_by: null, announced: reste })` **si aucune demande n'existe et que le reste est positif** (PK :
idempotent si le fait est relivré), puis `deferUntilCommit` vers
l'exécuteur. La suite est C4.7. Le carnet laisse ces commandes `failed` (C4.1, 8) : le reste se
calcule sur `chargedCents` et les remboursements, jamais sur le statut.
**Le statut ne dit donc rien de l'argent pour ces commandes** : `cancelled`

- `failed` avant comme après le remboursement. La liste « remboursement à
  faire », le bandeau du détail et la cloche lisent **la demande** (et son
  état lu au carnet) ; la croissance n'a rien à lire — elle exclut
  `cancelled` (C4.1, 7) et n'a jamais compté cet encaissement.
  Courriel : aucun de plus que ceux d'aujourd'hui (Q2). Clé de la cloche
  d'origine retirée avec son abonné ; la cloche ne sonne plus que sur incident.

⚠️ **Exige `chargedCents = total_cents` aussi pour ces commandes** : vrai
tant qu'une commande n'a qu'une intention (C3.4 ter, vérifié le 2026-10-12)
et qu'elle est dimensionnée sur `total_cents`.

#### C4.11 bis Correctifs du même passage (`vitruve`, BLOQUANT 2, SÉRIEUX 5, 6, 8)

- **`prisma-cancelled-order-payment.reader.ts:15-18`** retient aujourd'hui
  toute annulée portant l'intention, quel que soit son règlement : avec C4, un
  `payment_intent.succeeded` relivré sur une annulée `paid`/`refunded`
  ferait « encaissé après annulation » à tort. Le lecteur gagne
  `paymentStatus = failed` (le seul règlement d'une annulée non payée,
  C3.4) ; et l'abonné de C4.11 **ne fait rien** quand le reste est nul ou
  qu'une demande existe.
- **Un remboursement réussi qui échoue ensuite sur une annulée** (le carnet
  rend `restored`, `refunded → paid`), demande ou non : `RecordOrderRefundHandler`
  publie `order.refund_reversed` pour **toute** commande `cancelled` ; l'abonné
  ouvre la demande (cause neuve `refund_reversed`) si elle n'existe pas, ou
  `reopenAfterFailure` sinon, et sonne. Pas de relance Stripe automatique
  (Q3) : la demande attend le bouton.
- **`refund_in_flight` ne voit que le carnet** : un remboursement du tableau
  de bord dont le webhook n'est pas arrivé passe. Stripe, sans `amount`, ne
  rend que le reste réel ; le courriel dit donc « le montant payé par carte
  **qui ne vous a pas déjà été remboursé** » avec le chiffre annoncé, et
  l'écart éventuel va au journal (`order.refund_issued`). Assumé.
- **Valeurs irréversibles dès la première ligne** (§8) : `regime: "paid"`,
  l'enum Postgres `OrderRefundCause` (`cancellation`,
  `paid_after_cancellation`, `refund_reversed`), et les types de faits
  `order.refund_reversed`, `order.refund_attempt_failed`,
  `order.refund_issued`.
- Mineurs : la formule du reste (C4.4) ne compte plus que `succeeded` (le vol
  est refusé avant) ; `cancellationOf` (`order-cancellation.ts:97-100`)
  **inverse** sa branche `paid` (admise), elle ne perd pas qu'une phrase ;
  la cohérence `order_refund_request.stripe_refund_id` ↔ `order_refund.order_id`
  est vérifiée par le handler (refus si le `re_…` appartient à une autre
  commande), pas interdite en base — assumé.

#### C4.12 Les tests

- **domaine** : `cancellationOf` × régime `paid` × `refunded` × en vol ×
  inscrite ; `refundableCents` (succeeded, pending, failed, canceled
  mélangés) ; `OrderRefundRequest` : factory refuse 0, `issued` deux fois avec
  le même id → sans effet, avec un autre → refus, `reopenAfterFailure`
  seulement sur `failed`/`canceled`, la clé change avec la génération ;
  `refundRequestStateOf` sur les quatre états.
- **application** : l'annulation `paid` n'appelle **jamais** Stripe dans la
  requête ; inscrite → ni demande, ni fait ; bon `blocked` → ni demande ;
  reste nul → pas de demande, courriel variante ; `IssueOrderRefund` : les
  quatre issues du port, aucune ne lève ; `unavailable` incrémente `round`
  et `attempts`, sonne une fois par génération ; bail tenu → aucun appel ;
  demande déjà émise → aucun appel.
- **passerelle** (double HTTP de Stripe) : recherche par métadonnée avant
  création ; clé passée ; pas d'`amount` ; traduction des erreurs Stripe.
- **e2e** (`order-staff-cancel-refund*.e2e-spec.ts`, dates relatives,
  `--runInBand`) :
  - `paid` non inscrite → annulée, une demande, un `re_…` sur le double du
    prestataire, carnet `pending`, puis webhook `succeeded` → `refunded`,
    `order.refund_succeeded` une fois ;
  - **double clic / deux staffs** → une annulation, une demande, un
    remboursement, un courriel ; le second « déjà annulée » (409) ;
  - **course webhook** : `refund.created` livré **avant** l'écriture du
    handler (barrière) → une ligne `order_refund`, pas de refus `exceeds_charge` ;
    et **après** → idem ;
  - **exécuteur** : deux déclencheurs simultanés (fin d'annulation +
    bouton, ou balayage + bouton) → un seul prend le bail, un seul appel
    Stripe, le second rend « Stripe traite déjà » ; bail expiré → repris par
    le balayage ;
  - **échec Stripe** : `unavailable` trois fois puis succès → trois essais
    comptés en base, trois `round`, une cloche, un remboursement ;
    `declined` → cloche, `next_attempt_at` nul, ignorée du balayage ;
    `nothing_left` → cloche ; `409 idempotency_key_in_use` → `unavailable` ;
  - **`COMMIT` perdu après un `re_…` créé**, ou double qui oublie la clé →
    la recherche par métadonnée retrouve le `re_…`, aucun second ;
  - **génération** : `refund.failed` puis « Relancer » → la recherche
    ignore le `re_…` échoué de la génération 1, un second `re_…` part ;
  - **bail** : jeton périmé à l'étape 3 → aucune écriture de la demande,
    constat au carnet unique ; bail calculé à l'horloge murale (`FixedWallClock`
    avance pendant l'appel simulé) ;
  - **`exceeds_charge`** sur le constat de l'exécuteur → cloche, plus de rejeu ;
  - balayage : 25 demandes dues → 20 traitées, 5 au passage suivant ; sans
    jeton machine → 401 ;
  - **aucun appel sous transaction** : le double de Stripe échoue si une
    transaction est ouverte au moment de l'appel ;
  - `refund.failed` → cloche, état `failed`, « Relancer » → génération 2, un
    second `re_…`, carnet cohérent (Σ succeeded ≤ total) ;
  - remboursement partiel antérieur → le reste ; `refunded` → annulée sans
    demande ; remboursement en vol → refus `refund_in_flight` ;
  - **course clôture × annulation** (C3, sur une `paid`) → jamais une commande
    inscrite ET remboursée : la barrière entre `producibleFor` et le verrou ;
  - **paiement qui aboutit pendant l'annulation** : commande `pending` au
    clic, `cancelIntent` → `already_paid` → refus « le paiement vient
    d'aboutir : rechargez, l'annulation proposera le remboursement » (phrase
    neuve sur le bloc `paid_just_now`) ; après le webhook, l'annulation passe
    par C4 ;
  - bon soldé par la nuit sur une `paid` → C3b cas 3 + remboursement du seul
    `total_cents` ;
  - encaissé après annulation → demande `paid_after_cancellation`,
    remboursement automatique, aucune cloche ;
  - aucune facture carte émise, aucun avoir, aucune cloche « sans avoir » ;
  - sans `b2b_cancel_order:write` → 403 sur l'annulation et sur « Relancer ».
- **front** : la confirmation montre le montant ; le bandeau des quatre états ;
  « Relancer » désactivé sans droit ou quand Stripe traite.

#### C4.13 Ce que C4 ne fait pas

Remboursement partiel choisi à l'écran (Q1), « remboursé autrement » (Q3),
remboursement d'une commande fabriquée (Q4), annulation par le client (S2),
avoir sur facture mensuelle (C5, Q2). Le §2 D4/D5 et le §9 B2/B3/S3/S5 sont
**repris ici** : D4 (« synchrone, sans webhook ») et D5 (`voided`) sont
**abandonnés** — l'état persisté et le carnet les remplacent.

## 1. L'existant (ouvert et vérifié le 2026-09-17)

- **`cancelled` est dans l'énuméré `OrderStatus`, et aucun chemin ne l'écrit.**
  `production-day.ts` et `orders.seed.ts` le disent en toutes lettres.
- **Tous les lecteurs savent déjà l'écarter** — c'est ce qui rend le lot court :

  | Lecteur                                                 | Fichier                                                           | Effet d'une commande annulée |
  | ------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------- |
  | le plan du soir, la fiche, le prévisionnel, le compteur | `planWhere()` — `status = placed`                                 | exclue                       |
  | le dossier du jour                                      | `prisma-order.reader.ts` `listForProduction`                      | exclue                       |
  | le colisage                                             | `packingBlocker`                                                  | refusé, avec sa phrase       |
  | le retrait                                              | `handoverBlocker`                                                 | refusé, avec sa phrase       |
  | la file du comptoir                                     | `get-handover-queue.handler.ts`                                   | **gardée**, marquée annulée  |
  | le chiffre d'affaires                                   | `REVENUE_ORDER_STATUSES`                                          | exclue                       |
  | les volumes du tarif                                    | `prisma-sku-volume.reader.ts`, `prisma-customer-volume.reader.ts` | exclue                       |
  | l'assiette de prélèvement                               | `prisma-billable-orders.reader.ts`                                | exclue                       |
  | les normes et l'historique des alertes                  | `prisma-product-norm.store.ts`, `prisma-order-history.reader.ts`  | exclue                       |
  | la frise client                                         | `order-timeline.ts`                                               | « Commande annulée »         |

- **Le fournil ne détient aucune copie d'une commande `placed`.** Il s'inscrit
  les commandes à l'arrêt de la journée, par `DayOrdersReader.producibleFor`,
  qui lit `planWhere()`. Une commande annulée avant l'arrêt n'y entrera jamais ;
  une commande restée `placed` après l'arrêt (passée trop tard, ou visiteur en
  attente de paiement) n'y est pas non plus. **Il n'y a rien à propager au
  fournil**, et c'est la règle de Hugo qui le garantit.
- **Le règlement** : `paymentStatus` vaut `not_required`, `pending`, `paid`,
  `failed` ou `refunded` ; `refunded` n'est écrit par aucun chemin.
  `PaymentGateway` sait créer et relire une intention, et lire un webhook
  `succeeded` / `failed`. Il ne sait **ni annuler une intention, ni rembourser**.
- **Le webhook** `markPaid` bascule sous la seule condition
  `paymentStatus = pending` — il ne regarde pas `status`. Une commande annulée
  dont l'intention serait encore vivante deviendrait `paid` si le client payait.
- **Reprendre un paiement** (`GET /orders/:id/payment`) ne vérifie que
  `paymentStatus = pending` : une commande annulée resterait payable.
- **Précédent de forme** : le colisage — une règle pure qui rend une phrase
  (`packingBlocker`), puis une écriture conditionnée en base (`markReady`).

## 2. Décisions

**D1 — Seule une commande `placed` s'annule** (Hugo). `confirmed`, `ready`,
`fulfilled` et `cancelled` refusent. Règle pure `cancellationBlocker(status)`,
sur le modèle de `packingBlocker`, qui rend une phrase :

| État        | Refus                                                           |
| ----------- | --------------------------------------------------------------- |
| `confirmed` | « Cette commande est déjà dans le plan de production. »         |
| `ready`     | « Cette commande est déjà prête. »                              |
| `fulfilled` | « Cette commande a déjà été retirée. »                          |
| `cancelled` | aucun — **l'annulation répétée réussit sans rien refaire** (D6) |
| `draft`     | « Cette commande n'est pas encore passée. »                     |

⚠️ Une commande `placed` **après** l'arrêt de sa journée s'annule aussi. C'est
voulu : elle n'est dans aucun plan, et c'est exactement le cas de la carte
abandonnée ([règlement, §4.1](architecture-reglement-et-compte-de-production.md)).

**D2 — La base tranche la course avec l'arrêt de la journée.** L'écriture est
`updateMany where { id, status: placed }`, comme `absorbIntoPlan` l'est de son
côté. Si l'arrêt gagne, l'annulation rend `0` ligne et le refus de D1 ; si
l'annulation gagne, l'arrêt ne la voit plus. **Aucun état intermédiaire.**
Écriture nue justifiée au sens de `CLAUDE.md` §3.1 : une `load → save` perdrait
l'atomicité face à la clôture pour zéro invariant de plus.

**D3 — L'ordre des gestes : la base d'abord, Stripe ensuite.**

```mermaid
sequenceDiagram
    autonumber
    actor A as Client ou équipe
    participant O as b2b/orders
    participant DB as orders
    participant S as Stripe

    A->>O: annuler
    O->>DB: UPDATE … SET status = cancelled<br/>WHERE id AND status = placed
    alt 0 ligne
        O-->>A: refus de D1 (ou succès si déjà annulée)
    else 1 ligne
        alt not_required · failed
            Note over O: rien à faire côté argent
        else pending
            O->>S: annuler l'intention
            alt annulée
                O->>DB: paymentStatus = voided
            else déjà payée
                O->>S: rembourser (D4)
            end
        else paid
            O->>S: rembourser (D4)
        end
        O-->>A: 204
        O-)O: OrderCancelledEvent → 📧 + 📓
    end
```

Pourquoi la base d'abord : c'est elle qui tranche contre l'arrêt (D2). Annuler
l'intention avant, puis perdre la course, laisserait une commande **pro**
`confirmed` et `pending` — donc fabriquée — dont plus personne ne peut payer
l'intention.

Le prix de cet ordre : entre les deux gestes, une commande annulée a une
intention vivante. D5 ferme ce trou.

**D4 — Une commande payée est remboursée, en entier, automatiquement.** Avant
l'arrêt de la journée, rien n'a été fabriqué ni réservé : il n'y a rien à
retenir. `PaymentGateway` gagne `refund(paymentIntentId, amountCents)` ; le
webhook `charge.refunded` n'est pas nécessaire — l'appel synchrone suffit, et
`paymentStatus = refunded` s'écrit sous condition `paymentStatus = paid`.
Montant = `totalCents`, le TTC encaissé.

**D5 — Aucune annulation ne laisse d'intention payable.**

- `PaymentGateway` gagne `cancelIntent(paymentIntentId)`, qui rend `voided` ou
  `already_succeeded` (Stripe refuse d'annuler une intention réussie).
- **Nouvelle valeur `PaymentStatus.voided`** — « intention annulée, rien
  encaissé ». Migration **additive** (`ALTER TYPE … ADD VALUE`). Ni `failed`
  (le client n'a rien raté) ni `not_required` (il y avait bien quelque chose à
  payer) ne disent le vrai.
- **Le webhook `succeeded` sur une commande annulée rembourse.** Filet pour le
  trou de D3 et pour une annulation d'intention qui aurait échoué (Stripe
  indisponible) : `markPaid` bascule toujours, puis un abonné voit
  `status = cancelled` et appelle D4.
- **`GET /orders/:id/payment` refuse une commande annulée**, avant de regarder
  le règlement.

**D6 — Idempotente.** Annuler une commande déjà annulée rend `204` et ne
refait rien — ni Stripe, ni courriel. Le courriel ne part qu'au franchissement
(D2 rend `1` ligne).

**D7 — Qui peut annuler** — une route client et une route admin, journalisées
(Hugo, 2026-09-17).

- **le client**, sur ses propres commandes, sous le mur habituel
  (`ensureOrderVisible`) — `POST /orders/:id/cancel` ;
- **l'équipe**, sur toute commande — `POST /admin/orders/:id/cancel`, surface
  `b2b_orders`, avec un **motif obligatoire** (une annulation staff sans raison
  écrite devient un geste que personne n'explique) ;
- **le système**, pour l'expiration des impayés
  ([règlement, §4.1](architecture-reglement-et-compte-de-production.md)) — même
  commande applicative, motif fixe.

**D8 — Trois colonnes, additives et nullables.** `cancelledAt`,
`cancelledBy` (le `sub` qui a annulé, **figé** — une attestation, comme
`handedOverBy`), `cancellationReason` (texte, vide pour le client).
`cancelledByKind` (`customer` · `staff` · `system`) évite de deviner à quelle
population appartient l'identifiant — même raison qu'`order_idempotency` pour
refuser une colonne à deux populations.

**D9 — Le courriel de confirmation d'annulation** (Hugo). Il part sur
`OrderCancelledEvent`, hors de la requête (`BackgroundWork`), clé
d'idempotence déterministe par commande. Il dit :

- le numéro et le jour qui était prévu ;
- **ce qui arrive à l'argent**, et c'est la phrase qui compte :

  | Règlement à l'annulation | Phrase                                                         |
  | ------------------------ | -------------------------------------------------------------- |
  | `not_required`           | « Rien ne vous sera facturé pour cette commande. »             |
  | `pending` → `voided`     | « Aucun paiement n'a été prélevé. »                            |
  | `paid` → `refunded`      | « Nous vous remboursons X € ; comptez quelques jours ouvrés. » |
  | `failed`                 | « Aucun paiement n'a été prélevé. »                            |

- **aucun QR** — une commande annulée ne se retire pas.

⚠️ L'expiration automatique (D7, système) passe par le même courriel : un
visiteur dont la carte a été abandonnée apprend enfin ce qu'il est advenu de sa
commande. C'est le point 1 que Hugo avait à trancher au §4.1 du règlement.

**D10 — Le journal.** `order.cancelled`, sujet = le client, charge = qui, par
quel canal, motif, règlement résultant. Idempotent par commande.

**D11 — La dérogation d'heure limite consommée n'est pas rendue.** Elle visait
une journée ; la rendre rouvrirait une porte que l'équipe a accordée pour UNE
commande. Si le client recommande, l'équipe en accorde une autre.

## 3. Ce que ce plan ne fait pas

- Annuler après `confirmed` — la commande est dans le plan, le fournil la
  fabrique ; c'est un geste avec propagation, hors périmètre.
- Un remboursement **partiel**, ou retenir des frais.
- Rendre `fulfilled` terminal par l'agrégat (le cycle de vie, §6).
- Libérer un créneau de retrait public : aucune réservation n'existe encore
  ([`plan-creneaux-de-retrait.md`](plan-creneaux-de-retrait.md) est doc-first).
  Le jour où elle existera, l'annulation devra la rendre.

## 4. Les lots

**A — le domaine et l'écriture** : `cancellationBlocker` (pure, testée sur
chaque état) ; `OrderRepository.cancel(id, at, by, kind, reason)` conditionnée
sur `placed` ; migration `cancelled_at`, `cancelled_by`, `cancelled_by_kind`,
`cancellation_reason` ; `CancelOrderCommand` + handler ; `OrderCancelledEvent`.

**B — l'argent** : `PaymentGateway.cancelIntent` et `refund` (Stripe + double
de test) ; valeur `voided` (migration additive, `@lfd/contracts`, libellé de la
frise) ; écritures `markVoided` / `markRefunded` conditionnées ; abonné
« payé alors qu'annulée → rembourser » ; refus dans `GetOrderPaymentHandler`.

**C — les portes** : `POST /orders/:id/cancel`, `POST /admin/orders/:id/cancel`
(motif obligatoire) ; e2e : mur tenant, course avec l'arrêt de la journée, les
quatre règlements, la répétition.

**D — ce que le client apprend** : gabarit du courriel (fr, en, it), abonné,
`order.cancelled` au journal.

**E — les écrans** : bouton « Annuler » sur le détail client tant que
`placed` ; bouton + motif au back-office ; file du comptoir déjà prête.

`packages/contracts` change : `pnpm test` à la RACINE avant de conclure.

## 5. À trancher par Hugo

~~Le client peut-il annuler seul ?~~ **Oui** — tranché (D7).

1. **Le remboursement automatique** (D4) — ou un remboursement déclenché à la
   main par l'équipe, la commande restant `paid` jusque-là ?
2. **Une borne horaire en plus de `placed`** ? Aujourd'hui, une commande pour
   demain s'annule jusqu'à l'arrêt de la journée, quelle que soit l'heure.

## 9. La contradiction de `vitruve` (2026-09-17)

Chaque objection a été rouverte dans le code avant d'être reportée ici. Le plan
ci-dessus n'est **pas encore corrigé** : les BLOQUANTS changent sa forme, et deux
d'entre eux demandent une décision de Hugo (§9.3).

### 9.1 Les bloquants

**B1 — « `placed` » ne veut pas dire « pas encore au fournil ».** Le §1 et D2
sont faux. La clôture se fait en DEUX temps : `CloseProductionDayHandler` lit
`producibleFor` puis enregistre l'instantané du fournil ; la commande ne passe
`confirmed` qu'ensuite, dans un abonné de fond (`OnProductionDayClosed`).
Entre les deux, une commande est au fournil et encore `placed`. Le **retirage**
(`RetakeProductionDayHandler`) inscrit aussi des `placed` sans rien publier —
vérifié : « un retirage n'inscrit aucune commande NOUVELLE au commerce ». Et un
abonné tombé laisse des `placed` sur une journée close (`pendingInCommerce`).

→ **Direction** : le critère vrai est « **le fournil ne l'a pas inscrite** »,
lu chez lui par un port (`b2b → production`, permis par la matrice), et tenu
contre la clôture et le retirage par un **verrou de journée** partagé — sans
quoi la course lecture/instantané reste ouverte. `production-day.ts` le disait
déjà : « le jour où l'annulation existera, elle devra se propager jusqu'ici ».

**B2 — Un échec Stripe après l'écriture en base n'a pas de reprise.** Commande
`cancelled`, intention vivante ou argent non rendu ; le rejeu rend `204` (D6) ;
l'événement n'est publié qu'après Stripe, donc ni courriel ni journal.

**B3 — Le filet de D5 n'en est pas un.** Il tourne en `BackgroundWork`, dont
les échecs sont journalisés puis avalés ; le webhook a déjà répondu 200 et
`markPaid` ne rejouera plus (la ligne n'est plus `pending`). Un seul échec de
remboursement, et la commande reste `cancelled` + `paid` pour toujours.

→ **Direction commune à B2 et B3** : l'argent à rendre devient un **état
persisté** — écrit dans la même transaction que l'annulation — et pas un effet
de bord. L'annulation publie son fait tout de suite ; le règlement est une tâche
qu'on peut reprendre, avec un écran « à régulariser ». L'API n'a pas de
planificateur : la reprise se déclenche par un geste staff, ou au prochain
webhook de la commande.

**B4 — « Déjà payée » : double remboursement et état final faux.** Webhook
encore en vol, `cancelIntent` dit `already_succeeded`, on rembourse ;
`markRefunded` (conditionné sur `paid`) n'écrit rien ; le webhook passe la
ligne à `paid`, le filet rembourse une seconde fois. État final
`cancelled` + `paid` sur de l'argent rendu — et `OrderPaymentSettledEvent`
envoie l'accusé « votre commande entre dans la fournée », QR compris, à une
commande annulée (`OrderPlacedMail` ne regarde pas le statut).

→ **Direction** : croire Stripe, pas la base. Sur `already_succeeded`, écrire
d'abord `pending → paid` nous-mêmes, puis rembourser sous `paid → refunded` ; le
webhook tardif ne trouve plus de `pending` et ne publie rien. Et **tout
courriel d'accusé refuse une commande annulée**.

### 9.2 Les sérieux

| Objection                                                                                                                                                                                                                                                                                     | Vérifié                    | Sort proposé                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S1** un retrait écrase une annulation : `handoverBlocker` laisse passer `placed`, `markFulfilled` n'a pas de condition de statut                                                                                                                                                            | oui                        | `markFulfilled` conditionné sur `status <> cancelled` ; test de course                                                                                                                                                   |
| **S2** le mur client laisse **tout membre** de la société annuler — et se faire rembourser — la commande d'un collègue                                                                                                                                                                        | oui (`ensureOrderVisible`) | à trancher (§9.3)                                                                                                                                                                                                        |
| **S3** Stripe a plus de deux issues (`processing`, intention déjà annulée) ; pas de clé d'idempotence sur le remboursement ; `totalCents` au lieu du montant encaissé                                                                                                                         | —                          | `cancelIntent` rend aussi `processing` (refus d'annuler, « réessayez ») ; clé d'idempotence `refund:<orderId>` ; rembourser le montant encaissé lu chez Stripe                                                           |
| **S4** contredit le §4.1 du règlement (« Stripe d'abord ») ; aucun lot ne bâtit le déclencheur système                                                                                                                                                                                        | oui                        | l'expiration sort de ce plan ; le §4.1 sera réaligné sur la forme retenue                                                                                                                                                |
| **S5** lecteurs oubliés : la croissance lit `order.placed` au journal ; le prélèvement ne garde pas le fichier déposé ; aucun `refundedAt` ni identifiant de remboursement ; `PAYMENT: Record<PaymentStatus,…>` dans `order-format.ts` casse un onglet ouvert avant le déploiement des fronts | —                          | `order.cancelled` soustrait côté croissance ; `refundedAt` + `stripeRefundId` ; déployer les fronts **avant** la valeur `voided` ; l'annulation d'une commande au compte **déjà prélevée** est refusée ou traitée à part |
| **S6** un invité (sans identité de connexion) ne peut pas annuler ; `order.cancel` existe déjà comme sujet de demande                                                                                                                                                                         | —                          | assumé en V1 : l'invité écrit par le formulaire de demande, l'équipe annule                                                                                                                                              |
| **S7** `ALTER TYPE … ADD VALUE` ne se retire pas                                                                                                                                                                                                                                              | —                          | le dire ; `IF NOT EXISTS` ; aucune utilisation de `voided` dans la même migration                                                                                                                                        |

**Mineurs** — `in_production` manque au tableau de D1 ; clé d'idempotence du
courriel à nommer (`order.cancelled:<id>`) ; le motif staff ne doit pas
remonter dans la vue client ; `voided` à classer dans `production-plan.ts`.

### 9.3 Ce que Hugo doit trancher avant la refonte

1. **Le critère d'annulation** : « le fournil ne l'a pas inscrite » (B1) — ce
   qui interdit d'annuler une commande qu'un retirage a prise, même `placed`.
2. **Qui, dans une société, peut annuler** (S2) : tout membre, l'auteur seul,
   ou les rôles qui peuvent passer commande au nom de la société ?
3. **Le remboursement automatique** (§5.1) reste ouvert ; B2/B3 rendent
   l'alternative « l'équipe rembourse depuis l'écran à régulariser » moins
   coûteuse qu'elle n'en avait l'air.
