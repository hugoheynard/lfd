# Plan E7 — le reliquat, plan de bâti

> **Doc-first, 2026-10-25 au soir, révisé deux fois le même soir après
> `vitruve`.** Remplace, pour le bâti, [`plan-e7-1-le-jour-du-bon.md`](plan-e7-1-le-jour-du-bon.md),
> et s'appuie sur [`plan-e7-le-reliquat.md`](plan-e7-le-reliquat.md) (le
> programme et les décisions de Hugo, §3 et §4) et
> [`e7-recensement.md`](e7-recensement.md). **Mandat de Hugo (2026-10-25)** :
> tout le reliquat, sans question ; E9 (rembourser un reste payé par carte)
> **exclu**, il dépend de M2, reporté le 2026-10-23. Touche l'argent et des
> clés en base : contredit deux fois par `vitruve` (§6, onze points ; §6 bis,
> treize points), tous traités. **Bâtis** : L-points, L0 (recensements, annexes B à F), L1, L2, L3a, L3b, L3c, L3d, L4a et L4b (2026-10-26) ; rien d'autre.

## Coût réel (compté le 2026-10-25, seconde révision)

| Mesure                   | Valeur                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lots                     | **11** : L-points (autonome), L0 (doc), L1 à L9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tables migrées           | **15** : `delivery_note`, `production_order`, `packing_order`, `packing_line`, `packing_container`, `order_handover`, `order_departure`, `order_handover_proof`, `delivery_round_stop`, `delivery_stop_execution`, `delivery_stop_decision`, `delivery_day_readiness` (sa liste quitte la table pour une table fille **neuve**, la 16ᵉ), `orders` (valeur d'énum `partially_handed_over`, colonnes du manque abandonnées en place), `order_shortfall_decision` (unicité par envoi), et **une table neuve** `order_shortfall` (le manque par envoi). Une migration de **données** : le manque rang 1 recopié |
| Clés d'idempotence       | **44** émetteurs d’outbox lus, **25** portent une commande ou un jour (annexe A.1) : **8** changent de clé au-delà du rang 1, **4** gardent leur clé et portent `rank` dans le payload, **13** restent ; hors outbox, **15** clés construites avec une commande (annexe A.2) : **5** changent (dont une par l’arrêt), **10** restent                                                                                                                                                                                                                                                                        |
| Lecteurs                 | **140** fichiers de l'annexe B, lus en L0 (131 au jeton + 9 en SQL brut ; 69 sans lot, 26 en L5) + **21** lecteurs du manque du commerce (annexe C, LB ; « 27 » comptait 7 fichiers du colisage, qui lisent leurs propres colonnes) + **15** porteurs des faits de départ, de retirage et de `deliveryOrderIds` (annexe D, L3) + **11** du jeton de retrait (annexe E) ; des recoupements entre ces listes, non dédoublonnés                                                                                                                                                                                |
| Estimation (non mesurée) | L3 seul : deux à trois sessions de bâtisseur, e2e compris. Les dix autres : une session chacun, L0 et L-points moins. Soit **environ trois semaines** de bâti, un lot à la fois (`documentation/carte-des-chantiers.md`), revue et e2e comprises — une estimation, pas une mesure                                                                                                                                                                                                                                                                                                                           |
| Bâtissable tout de suite | **L-points** : un bug de l'existant (E6), indépendant d'E7, sans migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 0. Ce qui existe (ouvert le 2026-10-25)

Chemins relatifs à `apps/lfd-api/`. Chaque bâtisseur rouvre ce qu'il touche.

- `prisma/schema/public/delivery-notes.prisma:20-69` — `DeliveryNote` porte
  `rank` (CHECK ≥ 1) et `@@unique([orderId, rank])` (l.69), **aucun jour** ;
  ses lignes sont `DeliveryNoteLine` (l.78). Sa **seule** fabrique de domaine
  est `DeliveryNote.planFromOrder` (`src/b2b/delivery-notes/domain/entities/delivery-note.ts:127`),
  qui ne sait faire que le rang 1.
- **L'alignement refuse deux BL vivants** :
  `src/b2b/delivery-notes/domain/services/delivery-note-alignment.ts:122-125`
  rend `UNREPAIRABLE("several_live_notes")` ; « vivant » = non annulé
  (`domain/entities/delivery-note.ts:168`), donc un BL-1 **remis** reste
  vivant. L'aligneur (`application/services/delivery-note-aligner.ts`) tourne
  dans la transaction du geste ; le rattrapage est
  `application/commands/reconcile-delivery-notes.handler.ts`.
- `prisma/schema/production.prisma` — `ProductionOrder @@unique([serviceDay,
orderId])` (l.180) ; `OrderHandover.orderId @unique` (l.206) et
  `reference @unique` (l.208) ; `OrderDeparture.orderId @id` (l.238) ;
  `OrderHandoverProof.orderId @id` (l.265) ; `OrderWithdrawal.orderId @id`
  (l.745).
- `prisma/schema/packing.prisma` — `PackingOrder @@id([serviceDay, orderId])`
  (l.63), cible de **deux FK composites** : `PackingLine` (l.72, PK l.84) et
  `PackingContainer` (l.178) ; `PackingStock @@id([serviceDay, sku])`
  (l.95-109), partagé par toutes les feuilles du jour, et qui ne grandit **que**
  par les remises du fournil (`received`, l.99, écrit par
  `src/packing/infrastructure/prisma-packing-shadow.ledger.ts:84-90`).
- `prisma/schema/delivery.prisma` — les arrêts sont clés par **leur** id
  (`DeliveryRoundStop` l.214, `DeliveryStopExecution` l.347,
  `DeliveryStopDecision` l.467) et portent `orderId` en colonne (l.217, 349, 469) ; `DeliveryDayReadiness.deliveryOrderIds` (l.829) est un `String[]`
  d'`orderId`.
- **Le manque est unique par commande** :
  `prisma/schema/public/orders.prisma:330-335` porte le signal en colonnes de
  `orders` (`shortfall_reported_at`, `shortfall_lines`, `shortfall_cleared_at`,
  `shortfall_decided_at`) ; `OrderShortfallDecision.orderId @unique`
  (l.466-483). `OrderBilling.partial` vaut « une décision existe »
  (`src/b2b/orders/infrastructure/prisma-order-billing.repository.ts:33`).
- `src/b2b/orders/infrastructure/prisma-order.repository.ts:312-331` —
  `markReady` écrit **sur la commande**, par `orderNumber`, sous
  `readyAt: null` ; `markFulfilled` (l.336) sous `handedOverAt: null`.
- `src/b2b/orders/domain/entities/shortfall-decision.ts:122-135` —
  `ensureDecidable` exige `subject.status === "confirmed"` (le statut **de la
  commande**) et **refuse toute commande payée par carte**
  (`CardOrderShortfallError`, l.126-127).
- `src/packing/domain/entities/packing-sheet.ts:165-172` — le bac signalé
  « il manque » ne se ferme plus tant que le commerce n'a pas décidé ;
  `assertAllAllocated` (l.442). Le disponible d'un article est
  `received − returned − packed − sentToShop − reserved`
  (`src/packing/domain/entities/packing-stock.ts:102`).
- **Ce que le fournil voit à faire** : le reste d'une ligne est
  `max(0, quantité − Σ fournées)` (`src/production/domain/services/production-output.ts:90-103`) ;
  une fournée est remise au colisage (`production-handoff.ts:42`) et devient
  `received`. L'attendu d'une journée **ouverte** est lu par
  `src/b2b/orders/infrastructure/prisma-expected-production.reader.ts:59`
  (commandes `placed`, fragment `planWhere()`), celui d'une journée **tirée**
  est son plan (`production_order`). Les fournées se déclarent sur une journée
  tirée (`retake-production-day.handler.ts:117-119` en recopie).
- `src/production/application/commands/retake-production-day.handler.ts:40-50` — le
  retirage n'absorbe que des commandes `placed` ; il publie
  `ProductionDayRetakenEvent(…, orderIds)` (l.126), des `orderId` nus.
  `src/delivery/application/delivery-departure-support.ts:112` publie de même
  `DeliveryRoundDepartedFact(…, round.orderIds)`.
- **Le jeton de retrait** : `orders.handover_token @unique`
  (`prisma/schema/public/orders.prisma:375`) ; le scan le résout en
  **commande** (`src/b2b/orders/infrastructure/prisma-handover-subject.reader.ts:51`),
  la saisie par numéro de commande aussi (l.55). Côté écran, le scan et le
  panneau du bon sont `apps/lfd-backoffice-frontend/src/app/handover-shop/scan-dialog/`
  et `…/handover-shop/sheet-panel/`, servis au comptoir par
  `comptoir/comptoir-workspace/comptoir-workspace-page.ts:4`.
- **Points de fidélité** : crédités sur `ORDER_FULFILLED`
  (`src/b2b/loyalty/application/handlers/credit-points-on-handover.handler.ts:37`),
  sur les montants **de la commande** : `prisma-completed-order.reader.ts:18-29`
  sélectionne `subtotalCents`, `discountCents`, `voucherDiscountCents`, rendus
  l.109-111.
- **La facture au compte** : `OrderBilling.settlementOf`
  (`src/b2b/orders/domain/entities/order-billing.ts:162-170`) ne solde que
  sous `fulfilled`, et somme les BL remis quand `partial`. Le gel
  `orders_billable_frozen` (migration `20261025160000`, l.37) n'interdit que
  la **réécriture** de montants déjà posés sur une commande engagée ; la pose
  NULL → valeur reste permise. `prisma-unconfirmed-deliveries.reader.ts:35`
  liste les commandes au compte non soldées dont le jour est passé, et nomme
  déjà « en attente du reste » celles remises en partie (l.66).
- **Courriels au client** : « prête » part sur `order.ready`
  (`src/b2b/orders/application/handlers/send-order-ready-mail.handler.ts:59`),
  « en route » au départ de la tournée
  (`src/b2b/orders/application/services/delivery-en-route-mail.service.ts:62`) ;
  le courrier du manque existe (« Écrire au client », E6d), une clé par
  décision (`src/b2b/orders/domain/entities/shortfall-notice.ts:29-30`).
- Base de dev (`lfc_b2b_dev`, lecture seule, 2026-10-25) : 26 BL, **tous de
  rang 1** (6 `planned`, 19 `prepared`, 1 `handed_over`). Aucune donnée à
  reprendre côté BL.
- Dernière migration commitée : `20261026040000_la_photo_du_bon_signe`. Les
  migrations de ce plan viennent **après** elle.

## 1. Le modèle

Un **envoi** = (commande, rang). Le rang 1 est la commande elle-même ; un BL
de rang > 1 est un **reliquat**, né d'une décision, qui porte son jour.

```mermaid
flowchart LR
    C["Commande<br/>jour demandé D1"] --> E1["Envoi rang 1<br/>état lu sur la commande"]
    C --> E2["Envoi rang 2<br/>état lu sur le BL-2, jour D2"]
    E1 --> R1["Retrait ou livraison<br/>du rang 1"]
    E2 --> R2["Retrait ou livraison<br/>du rang 2"]
    R1 --> S{"Plus aucun envoi vivant<br/>non remis"}
    R2 --> S
    S -->|oui| F["Commande soldée<br/>fulfilled"]
```

## 2. Choix de l'assistant (2026-10-25, révisés deux fois après `vitruve`)

1. **Le BL-1 ne change pas de source.** Les sources du jour lisent `orders` /
   `order_lines` par `requestedDeliveryDate`, comme aujourd'hui.
2. **`delivery_note.service_day` nullable**, `CHECK (rank = 1 OR service_day
IS NOT NULL)`. Il **reste NULL au rang 1**, pour toujours : la date du BL-1
   est celle de la commande, sans copie.
3. **Deux vérités, une par rang**. Le BL-1 suit la commande ; un BL de rang > 1
   a son propre état (`planned` → `prepared` → `handed_over` | `voided`) que
   seuls les gestes **de son envoi** font avancer. L'alignement aligne **le
   BL-1** sur la commande et ignore les rangs > 1. `several_live_notes`
   devient « deux BL vivants **de même rang** ». La commande ne recopie jamais
   l'état d'un BL-2 : `orders.ready_at` / `status = ready` restent ceux du
   rang 1.
4. **Prêt par envoi.** Le scan de fermeture d'une feuille de rang > 1 écrit
   `prepared` **sur le BL** (sous `status = planned`, même arbitrage en base
   que `readyAt: null`), et n'appelle pas `markReady`.
5. **Identité aval = `(orderId, rank)`**, colonne `rank int NOT NULL DEFAULT
1`, sur `production_order`, `packing_order`, `packing_line`,
   `packing_container`, `order_handover`, `order_departure`,
   `order_handover_proof`, et les trois tables d'arrêt de `delivery`. **Pas**
   `order_withdrawal` : un retrait du fournil vise la commande entière.
6. **Les clés** (annexe A, **refaite** le 2026-10-25 en lisant les 44
   émetteurs d'outbox et les clés hors outbox, multi-lignes comprises) :
   celles qui décrivent un **envoi** gagnent `:r<rank>` **seulement quand
   rank > 1** (rang 1 = clé d'aujourd'hui à l'identique, rien ne se rejoue) ;
   celles dont la clé porte un **instant** ou une **tournée** gardent leur clé
   et portent `rank` (ou des envois) dans le payload ; celles qui décrivent la
   **commande** restent. `ORDER_FULFILLED` reste unique : il ne part qu'au
   **solde**. Un test « deux rangs, deux lignes » par clé qui change.
7. **Le reste se fabrique — révisé (SÉRIEUX 4 de la seconde contradiction).**
   La première version disait « le fournil n'ajoute rien » sans dire qui fait
   cuire le reste. Ce qui est vérifié : le fournil voit à faire
   `quantité − Σ fournées` par article et par jour (`production-output.ts:90-103`),
   ses fournées deviennent `received` au colisage (`prisma-packing-shadow.ledger.ts:84-90`),
   et le colisage ne manque d'un article que si son disponible est épuisé
   (`packing-stock.ts:102`). Donc, **quand le manque vient du four** (moins de
   fournées que le plan), le reste à faire du fournil **contient déjà** le
   manque : la ligne n'est pas complète, et la prochaine fournée entre dans
   `received` puis s'alloue à la seconde feuille. La règle, réécrite :
   - **Même jour** : le BL-2 n'ajoute **rien** au plan de D1 — l'attendu reste
     `commande` (le BL-1 n'en retire pas ses quantités non plus) ; il n'y a
     pas de double compte parce que le reste n'a **jamais été reçu**. Le
     colisage ouvre une feuille `(D1, orderId, 2)` sur le même stock.
   - **Garde** : le même jour n'est proposé que si, pour chaque article du
     reste, le reste à faire du fournil de D1 le couvre
     (`quantité − Σ fournées ≥ reste`). Sinon — le four a tout sorti et les
     pièces sont parties ailleurs (`sentToShop`, `packing-stock.ts:102`) —
     personne ne les cuirait : la décision ne propose qu'un **autre jour**.
     La lecture passe par un port que **le fournil déclare** dans
     `production/channels/commerce/` et implémente (`b2b → production` :
     port uniquement). Cas assumé : deux manques le même jour sur le même
     article se partagent ce reste ; la garde compare au reste **non déjà
     promis** à un BL-2 du jour.
   - **Autre jour (D2 ≠ D1)** : le BL-2 est un envoi **en plus** de D2 ; le
     plan de D2 l'ajoute (journée ouverte) ou le retirage l'absorbe (journée
     tirée), ce qui demande d'étendre le retirage
     (`retake-production-day.handler.ts:40-50` n'absorbe que des `placed`).
8. **Soldée = `fulfilled`** ; `partially_handed_over` à la remise d'un envoi
   qui n'est pas le dernier. `handed_over_at` / `received_on` restent la
   **première** remise (CHECK B4) ; « Reçue le » se lit sur le dernier BL.
9. **Le reliquat est réservé aux commandes au compte.** `shortfall-decision.ts:126-127`
   refuse le départ incomplet sur carte, et on **garde** ce refus (E9 exclu) :
   une commande carte n'a jamais de BL-2. **Les points** se créditent au
   solde, sur `ORDER_FULFILLED`, sur les montants **facturables**
   (`billable_*`) et non ceux de la commande — c'est le lot autonome
   **L-points** (choix 16).
10. **Date du BL-2** : choisie dans la décision, ≥ D1, jamais un jour fermé.
    **Montants** par la fabrique E6c1 (pourcentages réappliqués, fixes, port
    et surtaxe à zéro), calculés **sur les lignes du BL-2 seul**. Aucune
    commande ne corrige un BL remis (`src/b2b/delivery-notes/application/commands/`
    n'en a pas, ouvert le 2026-10-25) ; ce qui se réécrit avant engagement,
    ce sont les montants facturables de la commande, par le rapprochement
    (`order-billing.ts:105`). Un BL-1 « corrigé » ainsi ne touche pas le BL-2 :
    le solde est la somme des BL, chacun avec ses montants.
11. **Un manque sur un BL-2 a une issue.** `ensureDecidable` lit le statut
    **de l'envoi signalé**, plus celui de la commande (SÉRIEUX → BLOQUANT 3
    de la seconde contradiction) : rang 1 → `orders.status === "confirmed"`
    comme aujourd'hui ; rang > 1 → BL `planned`. Le même jour, le rang 1 peut
    être `ready` pendant que le rang 2 colise : c'est le rang 2 qui décide.
    Le signal et la décision sont **par envoi** (choix 15). La décision peut
    créer le rang suivant ou abandonner (L9).
12. **Q-R1** : preuve et arrêt par envoi. Un arrêt de livraison gagne `rank`
    (défaut 1). **La référence d'un envoi est un value object**
    `ShipmentRef { orderId, rank }` (révisé, SÉRIEUX 10) — jamais une chaîne
    `orderId#r` : `DeliveryDayReadiness.deliveryOrderIds` (`String[]`,
    `delivery.prisma:829`) est remplacé par une **table fille**
    `delivery_day_readiness_shipment (service_day, order_id, rank)`, PK sur les
    trois ; les faits qui portaient des `orderIds` nus —
    `ProductionDayRetakenEvent` (`retake-production-day.handler.ts:126`),
    `DeliveryRoundDepartedFact` (`delivery-departure-support.ts:112`),
    `DeliveryOrdersBroughtBackFact` — portent une liste `shipments:
[{ orderId, rank }]` ; leur `fromPayload` lit l'ancienne forme `orderIds`
    comme rang 1, pour les faits déjà écrits. Chaque BL suit la règle de
    signature de **son** arrêt.
13. **Le QR et la saisie (révisé, SÉRIEUX 8).** `orders.handover_token` reste
    **un par commande** : le client garde un seul QR pour toute la commande.
    Le scan résout la commande, puis le serveur rend **les envois prêts non
    remis** de cette commande. Un seul : le panneau du bon
    (`handover-shop/sheet-panel/`) s'ouvre sur lui, comme aujourd'hui. Deux
    (le même jour, le client n'est pas venu entre les deux) : le panneau liste
    les deux, **cochés par défaut**, « Remettre » remet chaque envoi coché dans
    une transaction, une preuve par envoi. `order_handover.reference` garde sa
    valeur au rang 1 et prend `-2`… au-delà ; la saisie d'un numéro de commande
    mène au même panneau.
14. **Migrations** : une par lot, dans le déploiement du code (pré-release,
    Hugo 2026-10-04), ordonnées après `20261026040000`. Pour `packing_order` :
    ajouter `rank` aux trois tables, **DROP** les FK de `packing_line` et
    `packing_container`, DROP puis RECREATE la PK de `packing_order` sur
    `(service_day, order_id, rank)`, RECREATE la PK de `packing_line` sur
    `(service_day, order_id, rank, sku)`, RECREATE les deux FK sur les trois
    colonnes. Un seul `migration.sql`, une transaction. Aucune donnée
    supprimée.
15. **Le manque par envoi (BLOQUANT 2, neuf).** Table neuve `order_shortfall
(order_id, rank, reported_at, lines jsonb, cleared_at, decided_at)`, PK
    `(order_id, rank)` ; `order_shortfall_decision` perd `order_id @unique`
    pour `@@unique([orderId, rank])` (colonne `rank NOT NULL DEFAULT 1`). La
    migration **recopie** les colonnes de `orders` (l.330-335) en lignes de
    rang 1 ; les colonnes restent en base, mortes (CLAUDE.md §0 : pas de
    suppression en production) — un lot de resserrement ultérieur, hors de ce
    plan, les retirera. `OrderBilling.partial` devient « une décision existe
    pour un envoi de la commande ». Les 21 lecteurs (annexe C)
    lisent la table. Le fait `packing.shortfall_reported` porte `rank` dans
    son payload ; sa clé (à instant) ne change pas.
16. **Les points au solde, lot autonome (SÉRIEUX 5).** Bug **de l'existant**
    depuis E6 : un reste abandonné rapporte des points sur le tout, parce que
    `prisma-completed-order.reader.ts:109-111` rend les montants commandés. Le
    lecteur rend les `billable_*` (`orders.prisma:344-348`), posés par
    `closeBilling` dans l'unité de travail du geste qui solde
    (`order-billing-closer.ts:66-72`), donc présents quand `ORDER_FULFILLED`
    arrive. **Non vérifié** : que ce chemin pose `billable_*` aussi pour une
    commande **carte** (`settlementOf` rend `null` sans `received_on`,
    `order-billing.ts:168`) ; c'est le premier test du lot. Si `billable_*`
    est nul au crédit, on **refuse** (erreur nommée), on n'invente pas de
    repli. **Bâti le 2026-10-25** : la carte pose bien `billable_*` à la
    remise, dans les deux ordres des faits (`apps/lfd-api/test/loyalty-earning.e2e-spec.ts`) ;
    `findCompleted` refuse par `CompletedOrderUnsettledError`, les parcours
    de rattrapage n'ont que les commandes soldées. Constaté au bâti : le bug
    est **latent** — le départ incomplet n'existe qu'au compte, et aucune
    route ne fait passer une commande au compte à `paid` ;
    `apps/lfd-api/test/loyalty-partial-order.e2e-spec.ts` pose ce `paid` par écriture brute
    datée.
17. **Le client est prévenu de chaque envoi (BLOQUANT 1, choix de
    l'assistant, 2026-10-25).** Oui : le BL-2 envoie « prête » (retrait) quand
    il est `prepared`, et « en route » (livraison) au départ de sa tournée —
    **un courriel par envoi**, sinon un client qui a reçu « prête » le matin
    vient chercher le reste au hasard. Le texte dit « le reste de votre
    commande » (une variante du gabarit, donc `pnpm mail-copy:digest`). Clés :
    `order.ready:<id>` et `delivery.en_route:<id>:<tournée>` gagnent
    `:r<rank>` au-delà du rang 1. Le courrier du manque (E6d) annonce la date
    du BL-2 quand le reste est à relivrer.
18. **La facture au compte (SÉRIEUX 6), point par point.**
    - `settlementOf` ne solde que sous `fulfilled` (`order-billing.ts:164`) :
      **voulu**, `fulfilled` = dernier envoi remis (choix 8) ; une commande
      `partially_handed_over` n'a rien de facturable.
    - Le lecteur des livraisons non confirmées (`prisma-unconfirmed-deliveries.reader.ts:35`)
      range une commande à BL-2 entre D1 et D2, et la nomme déjà « en attente
      du reste » (l.66) : **gardé**, en ajoutant la date du BL-2 (« reste
      prévu le D2 ») pour que la comptabilité ne relance pas un client qui
      attend.
    - Le gel `orders_billable_frozen` : sans effet avant le solde, puisque
      rien n'est posé (`migration.sql` l.37 : `OLD.billable_total_cents IS NOT
NULL`). Après le solde, un BL-2 abandonné **ne repose rien** : le solde
      est déjà la somme des BL remis.
    - Montants du BL-2 quand le BL-1 a été corrigé : choix 10.

## 3. Les lots

```mermaid
flowchart LR
    LP["L-points autonome"]
    L0["L0 recensements"] --> L1["L1 jour du BL et fabrique"]
    L1 --> L2["L2 alignement par rang"]
    L2 --> L3["L3 rang en aval et clés"]
    L3 --> L4["L4 prêt et retrait par envoi"]
    L4 --> L5["L5 état dérivé et solde"]
    L5 --> LB["LB manque par envoi"]
    LB --> L7["L7 sources du jour"]
    L7 --> L8["L8 reste à relivrer"]
    L8 --> L9["L9 abandon après coup"]
```

| Lot          | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Preuve                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L-points** | ✅ bâti le 2026-10-25 (non commité à l'écriture) — choix 16 : `PrismaCompletedOrderReader` rend les `billable_*` ; refus nommé s'ils sont nuls ; aucune migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | régression : une commande à reste abandonné (E6) crédite sur la somme des BL remis ; une commande complète, inchangée ; une carte                                                                                                             |
| **L0**       | ✅ fait le 2026-10-25 (non commité à l'écriture) — annexes B à F. Classer, **en lisant chaque fichier**, les 130 de l'annexe B (remise d'un envoi / soldée / jour) ; confirmer l'annexe A (envoi, payload, commande) ; toutes les listes de statuts explicites face à `partially_handed_over`. Doc seule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | annexes A et B tranchées, une ligne par fichier                                                                                                                                                                                               |
| **L1**       | ✅ bâti le 2026-10-26 (non commité à l'écriture ; migration `20261026050000_le_jour_du_reliquat`, `DeliveryNoteRemainderSource` porte le jour demandé D1) — `service_day` nullable + CHECK ; **fabrique de domaine** `DeliveryNote.planRemainder(id, source, rank, serviceDay, at)` qui refuse rang 1 et jour absent (SÉRIEUX 7 : les lots suivants s'en servent pour leurs données de test, jamais d'`INSERT` brut, CLAUDE.md §5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | la base refuse un rang 2 sans jour ; la fabrique refuse les mêmes cas                                                                                                                                                                         |
| **L2**       | ✅ bâti le 2026-10-26 (non commité à l'écriture ; sans migration ; `DeliveryNote.followsItsOrder`, filtre du rang 1 dans `alignmentOf` et `termsGapsOf` ; l'union et la liste de l'annexe F attendent la valeur d'énum de L5) — alignement par rang (choix 3) dans `delivery-note-alignment.ts` et le rattrapage ; `several_live_notes` par rang                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | un BL-1 remis + un BL-2 (fabrique L1) vivant : aligné, pas `UNREPAIRABLE`                                                                                                                                                                     |
| **L3**       | **coupé en quatre tranches le 2026-10-26** (L3a à L3d ci-dessous), parce qu'il ne tenait pas en un passage relisible. Contenu d'origine : `rank` et clés (choix 5, 14) ; `ShipmentRef` et la table fille de `delivery_day_readiness` (choix 12) ; les 8 clés d'outbox et 5 clés hors outbox qui changent, les 4 payloads (annexe A) ; `rank` dans `PackingListOrder` et les contrats de canal ; `fromPayload` qui lit l'ancienne forme ; adaptateurs à `rank: 1`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | e2e plan, colisage, retirage, tournées inchangés ; clé de rang 1 identique ; « deux rangs, deux lignes » par clé qui change                                                                                                                   |
| **L3a**      | ✅ bâti le 2026-10-26 (non commité à l'écriture ; **sans migration**) — **les faits et leurs clés**. `ShipmentRef` (value object du fournil, `apps/lfd-api/src/production/domain/value-objects/shipment-ref.value-object.ts`, réexporté par ses quatre canaux comme `ServiceDay`), `shipmentKeySuffix` (vide au rang 1, `:r<rang>` au-delà), `shipmentRankOf` (absent = 1). Les 8 clés d'outbox « envoi » de l'annexe A.1 ; les 4 « payload » (`rank` dans le manque signalé/effacé, `shipments` dans le départ et le retirage, dont `fromPayload` relit `orderIds` au rang 1) ; `rank` dans `PackingListOrder` ; hors outbox, les deux traces de croissance et le courriel « prête ». Tous les émetteurs passent `FIRST_SHIPMENT_RANK` (ni le plan, ni la feuille, ni l'arrêt, ni l'attestation n'ont encore de rang) ; les lecteurs des faits de départ et de retirage prennent les commandes **distinctes** des envois | clés de rang 1 identiques (specs existantes inchangées sur la clé) ; un test « deux rangs, deux clés » par clé changée ; ancienne forme relue ; e2e du plan, colisage, retirage, tournées, retrait, manque                                    |
| **L3b**      | ✅ bâti le 2026-10-26 (non commité à l'écriture ; migration `20261026070000_le_rang_au_fournil_et_au_colisage` ; en tête, les quatre abonnés du commerce ignorent un fait de rang > 1 avec trace, garde `appliesToOrder` ; les gestes du poste et la décision du manque visent encore le rang 1, faute de rang dans leurs routes — L4, LB, L8) — `rank` en base au **fournil et au colisage** (choix 5, 14) : `production_order`, `packing_order` (PK), `packing_line` (PK), `packing_container`, DROP/RECREATE des deux FK composites, une migration ; la feuille du colisage prend son identité `(jour, commande, rang)` depuis `PackingListOrder.rank` ; les 8 fichiers de `packing/` de l'annexe C ; les émetteurs du fournil et du colisage (L3a) lisent le rang de leur ligne au lieu de `FIRST_SHIPMENT_RANK`                                                                                                      | e2e plan, colisage, retirage inchangés ; une feuille de rang 2 du même jour, distincte (`planRemainder`)                                                                                                                                      |
| **L3c**      | ✅ bâti le 2026-10-26 (non commité à l'écriture ; migration `20261026080000_le_rang_a_la_livraison`, avec recopie de `delivery_order_ids` en rang 1 ; côté TypeScript le rang s'appelle `shipmentRank`, `departureRank` étant déjà le rang de passage) — `rank` en base à la **livraison** : `delivery_round_stop`, `delivery_stop_execution`, `delivery_stop_decision` ; la clé `ON CONFLICT` de `prisma-stop-loading.repository.ts:160` ; la table fille `delivery_day_readiness_shipment` qui remplace `deliveryOrderIds` (choix 12) ; les émetteurs du départ et du rapport (L3a) lisent le rang de l'arrêt ; `learn-retaken-plan` lit les envois                                                                                                                                                                                                                                                                     | e2e tournées, chargement, départ inchangés ; deux arrêts d'une commande, deux rangs                                                                                                                                                           |
| **L3d**      | ✅ bâti le 2026-10-26 (non commité à l'écriture ; migration `20261026090000_le_rang_au_retrait`, sans recopie ; les lectures « par commande » du retrait lisent le rang 1, `firstShipmentKey`) — `rank` en base au **retrait** : `order_handover`, `order_departure`, `order_handover_proof` (colonnes et clés, défaut 1 ; le comportement par envoi reste L4) ; l'attestation émet le rang de sa ligne                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | e2e retrait, garde, preuve inchangés                                                                                                                                                                                                          |
| **L4**       | **coupé en quatre tranches le 2026-10-26** (L4a à L4d ci-dessous), parce qu'il touche quatre blocs (commerce, retrait, écran, courriels) et ne tenait pas en un passage relisible. Contenu d'origine : prêt par envoi (choix 4) ; `order_handover`, `OrderDeparture`, `OrderHandoverProof` par envoi ; QR, panneau à deux envois et saisie (choix 13) ; courriels « prête » et « en route » par envoi (choix 17)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | double scan refusé par envoi, preuve par envoi, deux envois prêts remis d'un geste, deux courriels                                                                                                                                            |
| **L4a**      | ✅ bâti le 2026-10-26 (non commité à l'écriture ; **sans migration**) — **prêt par envoi** (choix 4) : un second abonné à `packing.order_packed`, `OnRemainderPacked` (bons de livraison), prépare le BL du rang > 1 par `PrepareRemainderNoteCommand` sous le verrou de la commande, sans `markReady` ; `OnPackingOrderPacked` ne prend plus que le rang 1. La garde de L3b devient un **refus rejouable** (`ensureFirstShipment`, `LaterShipmentNotYetHandledError`) sur `handover.handed_over` (lot nommé : L4b) et `packing.shortfall_*` (LB)                                                                                                                                                                                                                                                                                                                                                                         | un seul envoi : commande prête, BL-1 préparé, comme avant ; bac du rang 2 : BL-2 préparé, commande et BL-1 intacts, aucun message en souffrance (`delivery-notes-ranks.e2e-spec.ts`) ; rang 2 refusé, rejouable, par les trois autres abonnés |
| **L4b**      | ✅ bâti le 2026-10-26 (non commité à l'écriture ; **sans migration**) — **retrait par envoi**, côté `handover/` : `findByOrderId` de l'attestation et des pièces par `(commande, rang)`, la règle de remise (`engrave`, verrou commun avec l'annulation) et « déjà retirée » par envoi, `order_handover.reference` suffixée `-2`… au-delà du rang 1, le lecteur des preuves et de leurs images, `handedOverAmong`, attestations, historique, garde (`firstShipmentsOf`), l'effacement à la demande (`EraseHandoverProofsHandler`) ; côté commerce, `handover.handed_over` de rang > 1 passe le **BL** de son rang `handed_over` (la commande reste au rang 1 jusqu'à L5) et le refus rejouable de L4a tombe pour ce fait                                                                                                                                                                                                  | double scan refusé par envoi ; preuve par envoi ; rang 1 inchangé (e2e retrait, garde, preuve)                                                                                                                                                |
| **L4c**      | **le QR et la saisie** (choix 13) : le scan et la saisie résolvent la commande, puis rendent les envois prêts non remis (`prisma-handover-subject.reader.ts`) ; même QR sur le sac du rang 2 (`packing-order-bag-label.reader.ts`) ; back-office `handover-shop/scan-dialog/` et `sheet-panel/` : un envoi, le panneau d'aujourd'hui ; deux, la liste cochée par défaut, « Remettre » remet chaque envoi coché dans une transaction, une preuve par envoi                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | deux envois prêts remis d'un geste ; un seul envoi : écran inchangé                                                                                                                                                                           |
| **L4d**      | **les courriels par envoi** (choix 17) : `order.ready` du rang > 1 publié à la préparation du BL-2 (L4a ne le publie pas), variante « le reste de votre commande » des gabarits « prête » et « en route » (`pnpm mail-copy:digest`), `delivery-en-route-mail.service.ts:70` (garde `fulfilled`/`handedOverAt`) et `mail-delivery-en-route.handler.ts` par envoi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | deux courriels, deux clés ; rang 1 inchangé                                                                                                                                                                                                   |
| **L5**       | `partially_handed_over` (valeur d'énum), solde dérivé ; verrous d'annulation et de révision sur « un envoi remis » ; facture au compte (choix 18) ; CA, volumes ; listes de statuts de L0 ; lecteurs de l'annexe B. **La transition partielle est prouvée ici**, avec un BL-2 fabriqué par `planRemainder`, **avant** L8 qui le crée en vrai (SÉRIEUX 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | identique avec un seul envoi ; BL-1 remis + BL-2 `planned` ⇒ `partially_handed_over`, puis BL-2 remis ⇒ `fulfilled` et solde = Σ BL                                                                                                           |
| **LB**       | le manque par envoi (choix 15) : table `order_shortfall`, unicité `(order_id, rank)` de la décision, migration de recopie ; `ensureDecidable` lit l'envoi (choix 11) ; `partial` ; les **21 lecteurs** de l'annexe C : 19 sous `b2b/` (`prisma-shortfall-*.{reader,repository}.ts` ×5, `prisma-order-shortfall.{reader,repository}.ts`, `prisma-order-billing.repository.ts`, `prisma-day-supervision.reader.ts`, `day-supervision.ts` et son port, `get-day-supervision.handler.ts`, `handover-order.query.ts`, `prisma-admin-order-list.reader.ts`, `revisable-order.row.ts`, `prisma-order-plan-release.ts`, trois de `accounting/infrastructure/`), `dev/scenario/purge/commerce.purge.ts` et `purge-coverage.ts` (les 7 de `packing/` lisent `packing_order`, ils passent par L3)                                                                                                                                    | rang 1 inchangé ; un manque au rang 2 pendant que le rang 1 est `ready` : décidable ; deux décisions, une par rang                                                                                                                            |
| **L7**       | `DayShipmentsReader.extraShipments(D)` → `{ shipment: ShipmentRef, serviceDay, status, lines }` des BL vivants de rang > 1 du jour, avec leur état ; les 14 sources du jour l'ajoutent ; règle du même jour et sa garde (choix 7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | sans BL-2 : sorties identiques ; BL-2 à D2 paraît à D2, pas à D1 ; même jour : plan de D1 inchangé                                                                                                                                            |
| **L8**       | « reste à relivrer » avec date ; BL-2 (fabrique L1) et montants ; seconde feuille le même jour ; entrée au plan de D2 ou au retirage étendu ; manque sur un BL-2 ; « reste relivré le <date> » sur colisage, Supervision, comptoir, feuille de route, fiche commande ; courrier du manque daté (choix 17)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | e2e un autre jour, le même jour (fournée après la décision allouée à la seconde feuille), le même jour refusé par la garde, manque au rang 2                                                                                                  |
| **L9**       | abandon du BL-2 par le superviseur, puis solde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | e2e                                                                                                                                                                                                                                           |

**Ne change pas** : la passation et la réservation du jour, les documents
de type « demande », la facture au compte hors solde, l'interdiction du
départ incomplet sur carte. **E9 exclu.**

**Irréversible** : dès qu'un BL-2 est remis en production, les clés « une
remise par commande » ne se resserrent plus.

## 3 bis. Ce que le bâti a appris (2026-10-26)

- **L2, la re-clôture** (`delivery-note-planner.ts`, `noteFor`) prenait le
  premier BL `planned` de la commande : un reliquat prévu passait pour le
  BL-1 dès que celui-ci était préparé. Corrigé avec L2 (filtre
  `followsItsOrder`), test qui échouait avant.
- **Annuler une commande qui a un reliquat vivant** — choix de l'assistant :
  l'annulation annule **tous** les BL vivants non remis, reliquat compris
  (une commande annulée n'a plus rien à livrer) ; elle reste refusée dès
  qu'un envoi est remis (verrou du 2026-10-26, retrait × annulation). À
  bâtir en **L5**, avec les verrous.
- **`partially_handed_over` dans les listes de l'alignement**
  (`delivery-note-alignment.ts:10`, `order-progress-for-delivery-note.ts:5`,
  `prisma-orders-to-reconcile-delivery-notes.ts:18`) : la valeur naît en
  L5, ces trois listes passent donc en **L5** (annexe F corrigée d'autant).
- **L3 coupé en quatre** (L3a à L3d) : faits et clés d'abord, sans
  migration, puis une tranche par bloc qui prend `rank` en base. Constaté en
  bâtissant L3a : `ShipmentRef` ne peut vivre que dans le fournil — chaque
  bloc en aval l'atteint par un canal différent (`production/channels/{packing,delivery,handover,commerce}/`),
  et aucun n'a le droit d'atteindre les autres ; le courriel « en route »
  (`delivery-en-route-mail.service.ts:62`) reste à la commande jusqu'en L4,
  son lecteur (`mail-delivery-en-route.handler.ts`) prenant les commandes
  distinctes des envois du départ.
- 🔴 **Ouvert par L3a, à fermer en L3b** : les abonnés du commerce à
  `packing.order_packed`, `handover.handed_over` et `packing.shortfall_*`
  relisent `rank` mais **ne s'en servent pas** — un fait de rang > 1 y
  déclarerait prête, remise ou en manque la **commande**. Aucun émetteur
  n'en produit tant que le fournil et le colisage n'ont pas de rang en base ;
  L3b, qui en crée la possibilité, les fait d'abord ignorer un rang > 1
  (journalisé) jusqu'à L4 et LB, qui les rendent par envoi.
  **Fermé en L3b le 2026-10-26** : `appliesToOrder` écarte le fait et
  l'écrit au journal applicatif ; le reçu est posé, le fait n'est donc pas
  rejoué quand L4 et LB arriveront.
- **L3c, ce que la livraison a appris** :
  - aucune clé étrangère à défaire : les trois tables d'arrêt sont clées par
    `stop_id`. Seul l'index unique partiel I3 (`delivery_round_stop_live_order_key`)
    passe de `order_id` à `(order_id, rank)`, prédicat recopié ;
  - la ligne `prisma-stop-loading.repository.ts:160` n'est plus un `ON
CONFLICT` écrit à la main mais un `createMany … skipDuplicates` sur
    `(stop_id, bin_id)` : sa clé est l'arrêt, qui porte le rang — **rien à
    changer** ;
  - « remplace `deliveryOrderIds` » demandait une **recopie** que le plan ne
    disait pas : la migration range chaque identifiant au rang 1 dans la
    table fille ; la colonne reste en base, morte (à retirer avec les
    colonnes du manque) ;
  - le rang de l'exécution et de la décision est **recopié** de l'arrêt à
    leur écriture ; aucune contrainte ne le relie à celui de l'arrêt ;
  - restent **par commande**, à reprendre quand un arrêt de rang 2 naîtra
    pour de vrai (**L7/L8**) : `DeliveryRound.assign` (pose le rang 1),
    `liveHolderOf(orderId)` (garde I3 avant écriture), la clôture
    `production.day_closed` (ne nomme que des commandes, rangées au rang 1),
    et les lecteurs de la livraison qui joignent par `orderId` (bacs,
    départs, rapportés, historique) — **L4** pour ceux du retrait.
- **L3d, ce que le retrait a appris** :
  - aucune clé étrangère à défaire : `order_id` est opaque sur les trois
    tables. L'unique `order_handover_order_id_key` devient
    `(order_id, rank)`, les deux clés primaires prennent le rang, CHECK
    `rank >= 1` ; `order_handover.reference` reste unique sur toute la table
    (le suffixe `-2` est L4). Aucune recopie de données ;
  - `OrderHandover` porte `rank` ; `attest` grave le rang 1, `factOf` émet le
    rang de **sa** ligne (une réannonce de rang 2 sort sous `…:r2:reannounced:…`) ;
    les pièces prennent le rang de l'attestation qu'elles prouvent ;
    l'effacement vise `(commande, rang)` ;
  - `OrderDepartureRepository` prend des `ShipmentRef` ; les deux abonnés
    (départ, rapportée) y passent encore les commandes **distinctes** au
    rang 1 ;
  - restent **par commande, au rang 1**, à rendre par envoi en **L4** :
    `findByOrderId` de l'attestation et des pièces, la règle de remise
    (`engrave`, le verrou commun avec l'annulation inchangé), le lecteur des
    preuves et de leurs images, les lecteurs `handedOverAmong`, attestations,
    historique et garde (`firstShipmentsOf`), et l'effacement « à la demande »
    (`EraseHandoverProofsHandler`, qui ne trouve que le rang 1).
- **L4a, ce que le prêt par envoi a appris** :
  - le prêt d'un reliquat est un **second abonné** au même fait plutôt
    qu'une branche dans `OnPackingOrderPacked` : la commande et le BL-2 sont
    deux raisons de changer. L'arbitrage n'est pas une écriture conditionnée
    `status = planned` comme le disait le choix 4, mais le **verrou de la
    commande** (`lockProgressOf`) que prennent déjà les autres écrivains du
    BL, puis l'agrégat (`prepare`) ; un BL déjà préparé ou remis est un
    succès sans effet, un BL absent ou annulé un refus (message mort,
    rejouable) ;
  - la garde de L3b **refuse** désormais au lieu d'ignorer : un fait de rang
    > 1 sur `handover.handed_over` ou `packing.shortfall_*` reste en boîte
    > d'envoi et se rejoue après L4b ou LB. Les faits déjà acquittés sous L3b
    > ne reviendront pas — aucun n'a pu être émis (aucun BL-2 n'existe en
    > production, §0) ;
  - le fait `order.ready` du rang > 1 n'est **pas** publié en L4a : sans la
    variante « le reste » (L4d), il aurait envoyé au client le texte de la
    commande entière.
- **L4b, ce que le retrait par envoi a appris** :
  - la règle juge « déjà retiré » sur **l'envoi** (`findByShipment`) ; le
    verrou de la commande (`lockForHandover`) reste pris pour tout rang —
    une commande annulée n'a plus d'envoi à remettre. La référence gravée
    est `shipmentReference` (numéro de commande au rang 1, `-<rang>`
    au-delà) ; le refus et la course nomment « le reste » au-delà du rang 1 ;
  - le BL-2 remis est un **second abonné** à `handover.handed_over`
    (`OnRemainderHandedOver` → `HandOverRemainderNoteCommand`, bons de
    livraison), même figure que L4a ; `OnOrderHandedOver` ne prend plus que
    le rang 1, et `ensureFirstShipment` ne garde plus que `packing.shortfall_*`
    (LB). Le jour de réception du BL-2 est le jour de Paris de l'instant :
    un arrêt de reliquat n'existe pas avant L7/L8 ;
  - **aucun geste ne remet encore un rang > 1** : le scan, la saisie et la
    porte passent le rang 1 (le choix des envois est L4c, l'arrêt de rang 2
    L7/L8) ; le service prend le rang, l'e2e (`apps/lfd-api/test/handover-by-shipment.e2e-spec.ts`)
    l'appelle directement ;
  - **par envoi** : l'attestation et les pièces (`findByShipment`), le
    lecteur des preuves et de leurs images (`ofShipment`, la fiche commande
    lit le rang 1 jusqu'à L8), `handedOverAmong` et les deux abonnés du
    départ et du retour (la garde s'écrit par envoi, dédoublonnée),
    l'effacement à la demande (tous les envois de la commande) ;
  - **restés au rang 1, choix de l'assistant** : les lecteurs dont la
    question porte sur la COMMANDE (`firstShipmentsOf`, justifié dans
    `first-shipment.key.ts`) — attestations de la file et de la feuille de
    route (L4c, L8), historique (`OrderHandoverHistoryReader` : dossier,
    jour de réception, annulation — L5), garde au contrôle qualité ; et
    `referencesAttestedSince` filtre désormais le rang 1 (une référence
    `-2` n'est pas un numéro de commande) ;
  - 🔴 **trou ouvert jusqu'à L5** : l'annulation ne voit que l'attestation
    du rang 1 (`ensureNotHandedOver`). Un reliquat remis AVANT son rang 1 —
    possible seulement quand L4c laissera décocher le rang 1 — laisserait
    annuler la commande. À fermer en L5 avec les verrous (§3 bis, annuler
    une commande qui a un reliquat).
- Lecteurs qui supposent encore un seul BL vivant par commande,
  rattachés : `production-planned-delivery-notes.reader.ts:23` (**L7**),
  `prisma-shortfall-aftermath.reader.ts:58` (**LB**).

## 4. Les risques, dans l'ordre

1. **L3**, le plus large : 13 clés qui changent, 4 payloads, huit tables, trois
   blocs (`production`, `packing`, `delivery`) et leurs contrats. Une clé
   oubliée **avale** le second envoi sans erreur (`ON CONFLICT DO NOTHING`,
   `src/platform/outbox/prisma-outbox.ts:47`) : la première annexe A en
   oubliait deux, dont la remise (`handover.handed_over`) — d'où le test par
   clé.
2. **L5** : 26 lecteurs de l'annexe B, et les listes de statuts de
   l'annexe F — dont un `switch` à `default` qui rendrait annulable une
   commande remise en partie (`order-cancellation.ts:215-225`), sans que le
   compilateur le dise.
3. **LB** : la seule migration de **données** du plan (recopie du manque),
   21 lecteurs (annexe C).
4. Le retirage étendu aux BL-2 d'un jour tiré (choix 7, D2 ≠ D1).
5. La garde du même jour (choix 7) lit le fournil depuis le commerce au
   moment de décider : une fournée annulée après la décision peut la rendre
   fausse. Assumé : la feuille de rang 2 reste ouverte, et un nouveau manque
   y est décidable (choix 11).

**Le même jour n'est pas reporté.** Hugo a dit que le cas courant est une
seconde livraison le jour même ; son coût réel est une seconde feuille sur
le même stock et une garde — L3 et L4 paient le reste de toute façon pour
l'autre jour.

## 5. Ce qui reste en dehors

E9 et donc tout reliquat sur carte ; la réception avec réserve à la porte
(R1) ; l'avertissement de retard sur un BL-2 (`warn-customer-of-delay.handler.ts:94`
reste « une fois par commande », rang 1) ; le resserrement des colonnes
mortes du manque sur `orders` (choix 15). La phrase « aucun courriel n'existe
pour le départ incomplet au compte » était **fausse** à la première
révision : le courrier E6d existe (`shortfall-notice.ts:29-30`).

## 6. Contradiction de `vitruve` (2026-10-25) et ce qui en a été fait

| #   | Objection                                     | Sort                                                                                                                                                  |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | l'alignement refuse deux BL vivants           | **corrigé** : choix 3, lot L2                                                                                                                         |
| B2  | aucun lot ne rend un envoi prêt               | **corrigé** : choix 4, lot L4                                                                                                                         |
| B3  | clés d'outbox en `orderId`                    | **corrigé** puis **refait** au §6 bis (l'annexe A de cette révision était incomplète)                                                                 |
| S4  | facture carte au solde                        | **corrigé** : travail nul, interdiction gardée ; points : voir §6 bis S5                                                                              |
| S5  | manque sur le BL-2 sans issue                 | **corrigé** : choix 11, puis par envoi au §6 bis                                                                                                      |
| S6  | `extraShipments` sans état, listes de statuts | **corrigé** : état porté (L7), listes recensées en L0 et touchées en L5                                                                               |
| S7  | `delivery` absent                             | **corrigé** : choix 12, lot L3                                                                                                                        |
| S8  | comptes faux                                  | **corrigé** : 49 / 42 / 78 / 62, 130 au total ; **refait en L0** : 50 / 42 / 80 / 62 en `.ts`, 131, plus 9 en SQL brut, 140 lus et classés (annexe B) |
| S9  | même jour compté deux fois, stock partagé     | **corrigé**, puis **révisé** au §6 bis S4 : la première réponse ne disait pas qui fait cuire le reste                                                 |
| S10 | ordre DROP/RECREATE des FK                    | **corrigé** : choix 14                                                                                                                                |
| S11 | saisie manuelle et suffixe `-2`               | **corrigé** : choix 13, révisé au §6 bis S8                                                                                                           |
| m   | 15 vs 14 sources                              | **corrigé** : 14 (recensement)                                                                                                                        |
| m   | `order_withdrawal` au rang inutile            | **corrigé** : retiré (choix 5)                                                                                                                        |
| m   | ordre après `20261026040000`                  | **corrigé** : §0, choix 14                                                                                                                            |
| m   | `service_day` NULL au rang 1                  | **corrigé** : choix 2                                                                                                                                 |
| m   | aucun BL de rang > 1 en base dev              | **vérifié** le 2026-10-25 : 26 BL, tous rang 1 (§0)                                                                                                   |

## 6 bis. Seconde contradiction de `vitruve` (2026-10-25) et ce qui en a été fait

| #   | Objection                                                                    | Sort                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | annexe A incomplète (clés multi-lignes, hors outbox) ; le BL-2 prévient-il ? | **corrigé** : annexe A refaite en lisant les 44 émetteurs et les clés hors outbox — 25 + 15 lignes, dont les deux manquées (`handover.handed_over`, `packing.order_packed`) ; **décidé** : un courriel par envoi (choix 17)                                 |
| B2  | manque et décision uniques par commande                                      | **corrigé** : choix 15, lot **LB** neuf, avant L7/L8, avec sa migration de recopie et ses 27 lecteurs (21 après L0, annexe C)                                                                                                                               |
| B3  | `ensureDecidable` lit le statut de la commande                               | **corrigé** : choix 11, il lit l'envoi signalé (lot LB)                                                                                                                                                                                                     |
| S4  | personne ne fait cuire le reste le même jour                                 | **corrigé** : choix 7 réécrit — le reste à faire du fournil contient le manque quand il vient du four (vérifié dans `production-output.ts`, `packing-stock.ts`, le registre du reçu) ; garde quand il ne le contient pas ; double compte écarté et justifié |
| S5  | points sur les montants de la commande                                       | **corrigé** : lot autonome **L-points**, bâtissable tout de suite (choix 16) ; le cas carte reste à vérifier, c'est son premier test                                                                                                                        |
| S6  | facture au compte : solde, non confirmées, gel, BL-1 corrigé                 | **traité** point par point au choix 18 : trois **assumés** (voulu ou sans effet, dit pourquoi), un **corrigé** (date du reste dans le lecteur des non confirmées)                                                                                           |
| S7  | lots non testables seuls                                                     | **corrigé** : fabrique `planRemainder` en L1 ; transition partielle prouvée en L5, avant L8                                                                                                                                                                 |
| S8  | le QR résout la commande                                                     | **corrigé** : choix 13, un QR par commande, panneau à deux envois cochés                                                                                                                                                                                    |
| S9  | retirage et départ portent des `orderIds` nus                                | **corrigé** : choix 12, `shipments` dans le payload, ancienne forme lue comme rang 1                                                                                                                                                                        |
| S10 | `orderId#r` en chaîne                                                        | **corrigé** : `ShipmentRef` et table fille (choix 12)                                                                                                                                                                                                       |
| m   | compte « 18 » faux                                                           | **corrigé** : 25 clés d'outbox portent une commande ou un jour, 15 hors outbox (annexe A)                                                                                                                                                                   |
| m   | `packing.shortfall_reported` / `cleared` : clé à instant                     | **corrigé** : classés « payload », clé inchangée                                                                                                                                                                                                            |
| m   | classer `delivery.round_departed` et `production.day_retaken`                | **corrigé** : tous deux « payload » (annexe A.1)                                                                                                                                                                                                            |

## Annexe A — les clés d'idempotence qui portent une commande ou un jour (refaite le 2026-10-25)

Méthode : la liste des fichiers qui définissent `durableFact()` hors tests
(**44** émetteurs, `src/platform/outbox/durable-event.ts:18` pour le contrat),
chaque `key` lue **avec ses lignes suivantes** (les `const base =` et les
`+` multi-lignes compris) ; puis, hors outbox, chaque `idempotencyKey`, chaque
chaîne gabarit préfixée qui interpole une commande, et chaque `ON CONFLICT`
de `src/`. Les 15 émetteurs qui ne portent ni commande ni jour (gestes de
site, catalogue, médias, factures, transferts, remises du fournil,
réassorts, retours) sont omis. « Envoi » = `:r<rank>` au-delà du rang 1 ;
« payload » = clé inchangée, `rank` ou `shipments` dans le payload ;
« commande » = inchangée. **Confirmée en L0 (2026-10-25)** : 44 émetteurs (le 45ᵉ fichier qui définit `durableFact` est le contrat `durable-event.ts`), chaque clé de A.1 et A.2 relue à la ligne citée, aucune correction.

### A.1 — Outbox (25)

| Fichier (`src/`)                                                     | Clé                                                | Classe                      |
| -------------------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| `production/channels/packing/packing-list-drawn.event.ts:79-81`      | `…:<jour>:<orderId>[:after-reopening:<t>]`         | envoi                       |
| `production/domain/events/order-withdrawn-after-close.events.ts:56`  | `…:<jour>:<orderId>`                               | envoi                       |
| `packing/domain/events/packing-sheet-withdrawn.events.ts:65`         | `…:<jour>:<orderId>`                               | envoi                       |
| `production/channels/packing/packing-order-packed.event.ts:40-46`    | `packing.order_packed:<orderId>[:reannounced:<t>]` | envoi (**manquait**)        |
| `handover/channels/commerce/order-handed-over.event.ts:68-74`        | `handover.handed_over:<orderId>[:reannounced:<t>]` | envoi (**manquait**)        |
| `b2b/orders/domain/events/order-ready.fact.ts:27`                    | `order.ready:<orderId>`                            | envoi                       |
| `b2b/orders/domain/events/order-shortfall-decided.event.ts:36`       | `…:<orderId>`                                      | envoi                       |
| `delivery/channels/handover/delivery-orders-brought-back.fact.ts:34` | `…:<roundId>:<orderIds joints>`                    | envoi (liste d'envois)      |
| `packing/channels/commerce/packing-shortfall-reported.event.ts:48`   | `…:<orderId>:<instant>`                            | payload                     |
| `packing/channels/commerce/packing-shortfall-cleared.event.ts:32`    | `…:<orderId>:<instant>`                            | payload                     |
| `delivery/channels/handover/delivery-round-departed.fact.ts:43`      | `…:<roundId>`                                      | payload (`shipments`)       |
| `production/channels/delivery/production-day-retaken.event.ts:46`    | `…:<jour>:<instant>`                               | payload (`shipments`)       |
| `production/domain/events/order-quantities-raised.events.ts:58`      | `…:<jour>:<orderId>:r<revision>`                   | commande (révision, rang 1) |
| `b2b/orders/domain/events/order-handed-over.event.ts:55`             | `order.fulfilled:<orderId>`                        | commande (solde)            |
| `b2b/orders/domain/events/order-cancelled.event.ts:108`              | `…:<orderId>`                                      | commande                    |
| `b2b/orders/domain/events/order-paid.fact.ts:30`                     | `…:<orderId>`                                      | commande                    |
| `b2b/orders/domain/events/order-paid-after-cancellation.event.ts:34` | `…:<orderId>`                                      | commande                    |
| `b2b/orders/domain/events/order-payment-failed.event.ts:79`          | `…:<orderId>:<cause>`                              | commande                    |
| `b2b/orders/domain/events/order-revised.event.ts:35`                 | `…:<orderId>:<revision>`                           | commande                    |
| `b2b/orders/domain/events/order-refund-failed.fact.ts:35`            | `…:<refundId>`                                     | commande                    |
| `b2b/orders/domain/events/order-refund-succeeded.fact.ts:27`         | `…:<refundId>`                                     | commande                    |
| `b2b/contact/domain/order-problem-reported.fact.ts:47`               | `…:<requestId>`                                    | commande                    |
| `delivery/channels/commerce/commerce-order-placed.fact.ts:38`        | `…:<orderId>`                                      | commande                    |
| `delivery/channels/commerce/commerce-order-revised.fact.ts:33`       | `…:<orderId>:<revision>`                           | commande                    |
| `delivery/channels/commerce/commerce-order-cancelled.fact.ts:31`     | `…:<orderId>`                                      | commande                    |

Hors compte, parce qu'ils ne portent qu'un jour sans commande et ne
distinguent aucun envoi : `production-day-closed.event.ts:61-67`,
`production-day-reopened.event.ts:47`, `resupply-launched.event.ts:50-52`,
`resupply-list-drawn.event.ts:61-63` (tous sous `production/channels/`).

### A.2 — Hors outbox (15)

| Fichier (`src/`)                                                                                                       | Clé                                                     | Classe                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `b2b/growth/application/handlers/on-order-ready.handler.ts:47`                                                         | activité `…:<orderId>`                                  | envoi                                                    |
| `b2b/growth/application/handlers/on-order-shortfall-decided.handler.ts:48`                                             | activité `…:<orderId>`                                  | envoi                                                    |
| `b2b/orders/application/handlers/send-order-ready-mail.handler.ts:59`                                                  | courriel `order.ready:<orderId>`                        | envoi (choix 17)                                         |
| `b2b/orders/application/services/delivery-en-route-mail.service.ts:62`                                                 | courriel `delivery.en_route:<orderId>:<roundId>`        | envoi (choix 17)                                         |
| `delivery/infrastructure/prisma-stop-loading.repository.ts:160`                                                        | `ON CONFLICT` sur `(stop_id, …)`                        | envoi (par l'arrêt, qui a son rang)                      |
| `b2b/orders/domain/entities/shortfall-notice.ts:29-30`                                                                 | courriel `order-shortfall:<decisionId>`                 | commande → envoi **par la décision** (LB), clé inchangée |
| `b2b/growth/application/handlers/on-order-handed-over.handler.ts:89`                                                   | activité `…:<orderId>`, écoute `ORDER_FULFILLED` (l.71) | commande (solde)                                         |
| `b2b/growth/application/handlers/on-order-placed.handler.ts:57`                                                        | activité `…:<orderId>`                                  | commande                                                 |
| `b2b/growth/application/handlers/on-order-cancelled.handler.ts:62`                                                     | activité `…:<orderId>`                                  | commande                                                 |
| `b2b/growth/application/handlers/on-order-revised.handler.ts:48`                                                       | activité `…:<orderId>:<revision>`                       | commande                                                 |
| `b2b/growth/application/handlers/on-order-abandoned.handler.ts:39`                                                     | activité `…:<orderId>`                                  | commande                                                 |
| `b2b/orders/application/commands/warn-customer-of-delay.handler.ts:94`                                                 | courriel `order.delay-warning:<orderId>`                | commande (§5)                                            |
| `b2b/orders/application/handlers/send-order-cancelled-mail.handler.ts:73`                                              | courriel `…:<orderId>`                                  | commande                                                 |
| `b2b/orders/application/handlers/send-order-placed-mail.handler.ts:154` et `services/order-placed-mail.service.ts:105` | courriel `order.placed:<orderId>`                       | commande                                                 |
| `b2b/alerts/domain/evaluate-order.ts:53-55` (cloche et courriel, `dispatch-alert-channels.service.ts:66,98`)           | `<kind>:<orderId>`                                      | commande (alertes de passation)                          |

Classées « commande » sans ligne propre, parce que leur clé ne porte qu'une
cause de paiement ou de remboursement : `send-payment-failed-mail.handler.ts:105`,
`send-payment-expired-mail.handler.ts:75`, `ring-failed-pro-settlement.handler.ts:84`,
`refund-attention-bell.ts:61`, `resend-order-payment-link.handler.ts:69`,
`settle-voucher-remainders.handler.ts:120`. Et deux unicités en base, déjà
justes : `delivery_note @@unique([orderId, rank])` (`delivery-notes.prisma:69`)
et l'index `loyalty_ledger_entries_earned_order_key` (un gain par commande,
au solde). `order_withdrawal` reste par commande (choix 5).

## Annexe B — les lecteurs de `fulfilled`, `handedOverAt`, `requestedDeliveryDate`, classés en lisant (L0, 2026-10-25)

Méthode : `grep -rl` des trois jetons sur `apps/lfd-api/src` hors
`__tests__` et hors client Prisma généré (`src/platform/database/client/`) ;
puis la même recherche en **SQL brut** (`requested_delivery_date`,
`handed_over_at`, `'fulfilled'`), que le jeton camelCase ne voit pas. Chaque
fichier a été ouvert à la ligne citée, et à son contexte quand la ligne ne
tranchait pas.

**Comptes, refaits** : `fulfilled` 51 fichiers dont 50 `.ts` (le 51ᵉ est
`b2b/shop-copy/infrastructure/embedded/shop-copy-manifest.json`, un texte —
c'est l'écart « non élucidé » de la révision précédente) ; `handedOverAt` 42 ;
union 80 ; `requestedDeliveryDate` 62 ; **131 fichiers `.ts`** au lieu de 130
(`b2b/contact/domain/errors/contact-errors.ts`, un code d'erreur, est apparu
depuis) ; **plus 9 fichiers** qui ne lisent que la forme SQL ou la citent :
**140** en tout.

Les classes : **R** « remise d'un envoi » (un envoi a changé de mains) ·
**S** « commande soldée » (plus aucun envoi à remettre, `fulfilled`) ·
**J** « jour de l'envoi » (ce qu'on fabrique, colise, livre ou sert ce jour-là) ·
**D** « date demandée par le client » (ce que la commande dit, à jamais) ·
**H** « hors sujet » (import, nom de constante, commentaire, code d'erreur).
« aucun » = aucun lot ne le touche, et c'est la conclusion de la lecture.
« (F) » renvoie à l'annexe F (liste de statuts).

| Fichier (`src/`)                                                                 | Ligne lue                                            | Classe    | Lot                         |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- | --------------------------- |
| `b2b/account/infrastructure/prisma-customer-sheet.reader.ts`                     | 39 `REVENUE_STATUSES` (F)                            | S         | L5                          |
| `b2b/accounting/application/document-specimens/specimen-data.ts`                 | 87 date du spécimen                                  | D         | aucun                       |
| `b2b/accounting/application/handlers/issue-card-invoice-on-fulfilled.handler.ts` | 16 nom du handler, écoute le solde carte             | S         | aucun (carte, choix 9)      |
| `b2b/accounting/application/queries/get-invoice-dossier.handler.ts`              | 116 date de la commande au dossier                   | D         | aucun                       |
| `b2b/accounting/card-invoice.providers.ts`                                       | 5 import                                             | H         | aucun                       |
| `b2b/accounting/domain/entities/billing-statement.ts`                            | 183 « dates demandées des bons »                     | D         | aucun                       |
| `b2b/accounting/domain/ports/procedure-orders.reader.ts`                         | 28 commentaire `handed_over_at` (SQL)                | R (1ʳᵉ)   | aucun (choix 8)             |
| `b2b/accounting/domain/services/card-invoicing.ts`                               | 97 `awaiting_handover`                               | R (1ʳᵉ)   | aucun (carte, choix 9)      |
| `b2b/accounting/domain/services/collection-procedure-invoices.ts`                | 27 commentaire `handed_over_at` (SQL)                | R (1ʳᵉ)   | aucun (choix 8)             |
| `b2b/accounting/domain/services/invoice-dossier-calendar.ts`                     | 43 date hors période                                 | D         | aucun                       |
| `b2b/accounting/domain/services/invoice-dossier-csv.ts`                          | 100, 183 colonne date demandée                       | D         | aucun                       |
| `b2b/accounting/domain/services/invoice-dossier-history-cells.ts`                | 16 libellé `handed_over_at_door` (SQL)               | H         | aucun                       |
| `b2b/accounting/domain/services/invoice-dossier-history.ts`                      | 108 un événement par remise                          | R         | L4                          |
| `b2b/accounting/domain/services/invoice-dossier.types.ts`                        | 44 type                                              | D         | aucun                       |
| `b2b/accounting/domain/services/invoice-lines.ts`                                | 108 `first/lastDeliveryDate` d'une ligne de facture  | J         | L5                          |
| `b2b/accounting/domain/services/monthly-invoicing.ts`                            | 223, 243 jour de réception                           | S         | L5                          |
| `b2b/accounting/infrastructure/frozen-invoice-order.mapper.ts`                   | 21, 54 date gelée                                    | D         | aucun                       |
| `b2b/accounting/infrastructure/prisma-card-invoicing.reader.ts`                  | 42 `handedOverAt`                                    | R (1ʳᵉ)   | aucun (carte)               |
| `b2b/accounting/infrastructure/prisma-procedure-orders.reader.ts`                | 50 fenêtre servie ; 89 `handedOver`                  | J · R     | L5 (choix 18)               |
| `b2b/accounting/infrastructure/prisma-unconfirmed-deliveries.reader.ts`          | 36 jour passé                                        | J         | L5 (choix 18, date du BL-2) |
| `b2b/alerts/infrastructure/prisma-order-history.reader.ts`                       | 20 `COUNTED_STATUSES` (F)                            | S         | L5                          |
| `b2b/contact/application/commands/report-order-problem.handler.ts`               | 143 `!order.fulfilled` refuse le signalement         | R         | L5                          |
| `b2b/contact/domain/errors/contact-errors.ts`                                    | 132 code `not_fulfilled`                             | H         | aucun                       |
| `b2b/contact/domain/ports/reportable-order.reader.ts`                            | 14 `fulfilled: boolean`                              | R         | L5                          |
| `b2b/contact/infrastructure/order-reportable-order.reader.ts`                    | 44 `status === "fulfilled"`                          | R         | L5                          |
| `b2b/delivery-notes/domain/entities/delivery-note.ts`                            | 57, 290 la remise **du BL**                          | R         | L1                          |
| `b2b/delivery-notes/domain/services/delivery-note-alignment.ts`                  | 10 union (F), 253 `fulfilledTarget`                  | R         | L2, L5                      |
| `b2b/delivery-notes/domain/services/delivery-note-sheet.ts`                      | 60, 204 la remise du BL                              | R         | aucun                       |
| `b2b/delivery-notes/domain/services/delivery-note-terms-control.ts`              | 6 `CONTROLLED_STATUSES` (F)                          | R         | L5                          |
| `b2b/delivery-notes/infrastructure/delivery-note.rows.ts`                        | 51 colonne du BL                                     | R         | aucun                       |
| `b2b/delivery-notes/infrastructure/prisma-delivery-note.repository.ts`           | 17 colonne du BL                                     | R         | aucun                       |
| `b2b/growth/application/handlers/on-order-handed-over.handler.ts`                | 95 écoute `ORDER_FULFILLED`                          | S         | aucun                       |
| `b2b/growth/domain/revenue-scope.ts`                                             | 9 `REVENUE_ORDER_STATUSES` (F)                       | S         | L5                          |
| `b2b/loyalty/application/handlers/credit-points-on-handover.handler.ts`          | 23 commentaire                                       | S         | aucun (L-points bâti)       |
| `b2b/orders/application/commands/mark-order-fulfilled.handler.ts`                | 83 écrit `fulfilled` à la remise                     | R         | L5                          |
| `b2b/orders/application/commands/place-order-for-customer.handler.ts`            | 89 `holdPlan`                                        | D         | aucun (choix 1)             |
| `b2b/orders/application/commands/place-order.handler.ts`                         | 223 `holdPlan`                                       | D         | aucun (choix 1)             |
| `b2b/orders/application/commands/place-shop-order.handler.ts`                    | 161 `holdPlan`                                       | D         | aucun (choix 1)             |
| `b2b/orders/application/document-specimens/specimen-data.ts`                     | 154, 249                                             | D         | aucun                       |
| `b2b/orders/application/document-specimens/specimen-order-summary.ts`            | 70                                                   | D         | aucun                       |
| `b2b/orders/application/handlers/on-order-handed-over.handler.ts`                | 53 fait du retrait → `MarkOrderFulfilled`            | R         | L4, L5                      |
| `b2b/orders/application/queries/get-guest-order-cancellation.handler.ts`         | 70                                                   | D         | aucun                       |
| `b2b/orders/application/queries/get-packing.handler.ts`                          | 48 jour du colisage                                  | J         | L7                          |
| `b2b/orders/application/queries/order-handover-proof-view.ts`                    | 15 preuve                                            | R         | L4                          |
| `b2b/orders/application/queries/quote-order.handler.ts`                          | 71                                                   | D         | aucun                       |
| `b2b/orders/application/services/delivery-en-route-mail.service.ts`              | 70 `status !== "fulfilled" && handedOverAt === null` | R         | L4 (choix 17)               |
| `b2b/orders/application/services/order-composition.service.ts`                   | 169, 207                                             | D         | aucun                       |
| `b2b/orders/application/services/order-content.ts`                               | 16                                                   | D         | aucun                       |
| `b2b/orders/application/services/order-drafting.service.ts`                      | 144, 214                                             | D         | aucun                       |
| `b2b/orders/application/services/order-revising.service.ts`                      | 177, 256                                             | D         | aucun                       |
| `b2b/orders/application/services/order-workshop-withdrawal.ts`                   | 48 commentaire SQL ; retrait du fournil par commande | J         | aucun (choix 5)             |
| `b2b/orders/domain/entities/order-billing.ts`                                    | 144, 164 solde sous `fulfilled`                      | S         | aucun (choix 18, voulu)     |
| `b2b/orders/domain/entities/order-customer-nudges.ts`                            | 143 « déjà retirée : rien à relancer »               | R         | hors plan (rang 1, cf. §5)  |
| `b2b/orders/domain/entities/order-revision.ts`                                   | 176, 231                                             | D         | aucun                       |
| `b2b/orders/domain/entities/order-shapes.ts`                                     | 88, 168                                              | D         | aucun                       |
| `b2b/orders/domain/entities/order.ts`                                            | 77, 299                                              | D         | aucun                       |
| `b2b/orders/domain/errors/order-fulfilled-payload.error.ts`                      | 7 code d'erreur                                      | H         | aucun                       |
| `b2b/orders/domain/events/order-handed-over.event.ts`                            | 55 `order.fulfilled:<id>`                            | S         | aucun (choix 6)             |
| `b2b/orders/domain/ports/completed-order.reader.ts`                              | 2 commentaire                                        | S         | aucun (L-points bâti)       |
| `b2b/orders/domain/ports/order-idempotency.store.ts`                             | 27 commentaire SQL                                   | H         | aucun                       |
| `b2b/orders/domain/ports/order-progress-for-delivery-note.ts`                    | 5 union (F), 12                                      | R         | L2                          |
| `b2b/orders/domain/ports/order.reader.ts`                                        | 145, 242                                             | J · D     | L7                          |
| `b2b/orders/domain/ports/order.repository.ts`                                    | 117 commentaire de `markFulfilled`                   | R         | L4, L5                      |
| `b2b/orders/domain/ports/site-arrival-orders.reader.ts`                          | 28 `STATUSES_AWAITING_PICKUP` (F)                    | J         | L7                          |
| `b2b/orders/domain/services/customer-cancellation-refusal.ts`                    | 71 verrou                                            | R         | L5                          |
| `b2b/orders/domain/services/day-supervision.ts`                                  | 51 `Record<OrderStatus, …>` (F)                      | R         | L5                          |
| `b2b/orders/domain/services/order-cancellation.ts`                               | 215-225 `switch` **avec `default`** (F)              | R         | L5                          |
| `b2b/orders/domain/services/order-fingerprint.ts`                                | 73                                                   | D         | aucun                       |
| `b2b/orders/domain/services/order-revisability.ts`                               | 148 verrou                                           | R         | L5                          |
| `b2b/orders/domain/services/order-revision-refusal.ts`                           | 27 libellé du verrou                                 | R         | L5                          |
| `b2b/orders/domain/services/order-sheet.ts`                                      | 225                                                  | D         | aucun                       |
| `b2b/orders/domain/services/packing.ts`                                          | 43 `fulfilled`, 46 `readyAt !== null`                | R         | L4                          |
| `b2b/orders/domain/services/production-plan.ts`                                  | 28 commentaire, `placed` seules                      | S         | aucun                       |
| `b2b/orders/infrastructure/cancellation-subject.row.ts`                          | 18                                                   | D         | aucun                       |
| `b2b/orders/infrastructure/delivery-note-order-progress.row.ts`                  | 20                                                   | R         | L2                          |
| `b2b/orders/infrastructure/handover-order.query.ts`                              | 119 `expectedOnWhere(day)`                           | J         | L7 (+ LB)                   |
| `b2b/orders/infrastructure/prisma-admin-order-list.reader.ts`                    | 99, 102 filtre de dates                              | D         | aucun (+ LB)                |
| `b2b/orders/infrastructure/prisma-company-order-list.reader.ts`                  | 61                                                   | D         | aucun                       |
| `b2b/orders/infrastructure/prisma-company-order-summary.reader.ts`               | 24                                                   | D         | aucun                       |
| `b2b/orders/infrastructure/prisma-completed-order.reader.ts`                     | 14                                                   | S         | aucun (L-points bâti)       |
| `b2b/orders/infrastructure/prisma-customer-cancellation-subject.reader.ts`       | 28                                                   | D         | aucun                       |
| `b2b/orders/infrastructure/prisma-customer-nudge-trace.reader.ts`                | 23                                                   | J         | hors plan (rang 1, cf. §5)  |
| `b2b/orders/infrastructure/prisma-day-orders.source.ts`                          | 50                                                   | J         | L7                          |
| `b2b/orders/infrastructure/prisma-day-supervision.reader.ts`                     | 47 jour ; 105 `notIn` (F)                            | J         | L7, L5 (+ LB)               |
| `b2b/orders/infrastructure/prisma-deadline-orders.reader.ts`                     | 32                                                   | J         | L7                          |
| `b2b/orders/infrastructure/prisma-delivery-order-states.reader.ts`               | 31-58 `READY_STATUSES` (F), état **par commande**    | R         | L3, L4                      |
| `b2b/orders/infrastructure/prisma-delivery-orders.reader.ts`                     | 24, 130                                              | J         | L7                          |
| `b2b/orders/infrastructure/prisma-expected-production.reader.ts`                 | 51                                                   | J         | L7                          |
| `b2b/orders/infrastructure/prisma-handover-queue.reader.ts`                      | 51 `expectedOnWhere(day)` (SQL seul au jeton)        | J         | L7                          |
| `b2b/orders/infrastructure/prisma-order-customer-nudges.repository.ts`           | 40, 63                                               | R · D     | hors plan (rang 1)          |
| `b2b/orders/infrastructure/prisma-order-notice-summary.reader.ts`                | 28                                                   | D         | aucun                       |
| `b2b/orders/infrastructure/prisma-order-plan-release.ts`                         | 29                                                   | J         | L7 (+ LB)                   |
| `b2b/orders/infrastructure/prisma-order-revision-history.reader.ts`              | 35                                                   | D         | aucun                       |
| `b2b/orders/infrastructure/prisma-order-revision.repository.ts`                  | 68                                                   | D         | aucun                       |
| `b2b/orders/infrastructure/prisma-order.reader.ts`                               | 286 `listForProduction` ; 101, 495 ; 132, 532        | J · D · R | L7                          |
| `b2b/orders/infrastructure/prisma-order.repository.ts`                           | 300 jour ; 329 `notIn` (F) ; 353-360 `markFulfilled` | J · R     | L7, L4, L5                  |
| `b2b/orders/infrastructure/prisma-orders-to-reconcile-delivery-notes.ts`         | 18 `RECONCILED_STATUSES` (F)                         | R         | L2, L5                      |
| `b2b/orders/infrastructure/prisma-pending-orders.reader.ts`                      | 39 jour ; 66, 76 listes (F)                          | J · R     | L7, L5                      |
| `b2b/orders/infrastructure/prisma-purchase-history.reader.ts`                    | 46 `requested_delivery_date` (SQL)                   | D         | aucun                       |
| `b2b/orders/infrastructure/prisma-site-arrival-orders.reader.ts`                 | 28                                                   | J         | L7                          |
| `b2b/orders/infrastructure/prisma-transfer-orders.reader.ts`                     | 41                                                   | J         | L7                          |
| `b2b/orders/infrastructure/prisma-unpaid-link-order.reader.ts`                   | 42 (carte)                                           | D         | aucun                       |
| `b2b/orders/infrastructure/prisma-unsettled-settlement.reader.ts`                | 31 (carte, `placed`)                                 | J         | aucun                       |
| `b2b/orders/infrastructure/prisma-voucher-order.reader.ts`                       | 36                                                   | D         | aucun                       |
| `b2b/orders/infrastructure/revisable-order.row.ts`                               | 73                                                   | D         | aucun (+ LB)                |
| `b2b/orders/infrastructure/revised-composition.ts`                               | 6, 73                                                | D         | aucun                       |
| `b2b/orders/orders.module.ts`                                                    | 14 import                                            | H         | aucun                       |
| `b2b/pricing/infrastructure/prisma-customer-volume.reader.ts`                    | 17 liste (F)                                         | S         | L5                          |
| `b2b/pricing/infrastructure/prisma-sku-volume.reader.ts`                         | 18 liste (F)                                         | S         | L5                          |
| `delivery/application/commands/bring-stop-back.handler.ts`                       | 23 commentaire ; 62 émet le fait (annexe D)          | R         | L3                          |
| `delivery/application/commands/deposit-stop.handler.ts`                          | 16 commentaire, dépôt = remise                       | R         | L4                          |
| `delivery/application/doorstep-handover.ts`                                      | 84, 171 commentaires                                 | R         | L4                          |
| `delivery/channels/handover/doorstep-handover.attestor.ts`                       | 17 commentaire                                       | R         | L4                          |
| `dev/scenario/purge/outbox.purge.ts`                                             | 13 commentaire                                       | H         | aucun                       |
| `dev/scenario/purge/scenario-scope.ts`                                           | 59                                                   | D         | aucun                       |
| `dev/seeding/counter-day.seed.ts`                                                | 289 heure semée                                      | H         | aucun                       |
| `dev/seeding/invoice-handovers.seed.ts`                                          | 70, 78                                               | R · D     | aucun                       |
| `dev/seeding/order-placing.seed.ts`                                              | 333                                                  | D         | aucun                       |
| `handover/application/commands/confirm-handover.handler.ts`                      | 16 commentaire                                       | R         | L4                          |
| `handover/application/queries/get-handover-queue.handler.ts`                     | 123                                                  | R         | L4                          |
| `handover/application/queries/get-handover.handler.ts`                           | 87 date ; 96 remise                                  | R · D     | L4                          |
| `handover/application/services/handover-attestation.service.ts`                  | 153, 193                                             | R         | L4                          |
| `handover/application/services/handover-departure-holds.ts`                      | 38 jour de la retenue                                | J         | L7                          |
| `handover/application/services/quality-hold.ts`                                  | 17                                                   | J         | L7                          |
| `handover/channels/commerce/delivery-run-sheet.reader.ts`                        | 34 commentaire SQL, jour de service                  | J         | L7                          |
| `handover/channels/commerce/handover-queue.reader.ts`                            | 42 commentaire SQL                                   | J         | L7                          |
| `handover/channels/commerce/handover-subject.reader.ts`                          | 26                                                   | J         | L4, L7                      |
| `handover/channels/commerce/index.ts`                                            | 10 commentaire                                       | H         | aucun                       |
| `handover/channels/commerce/order-handed-over.event.ts`                          | 58, 78 (clé : annexe A)                              | R         | L3, L4                      |
| `handover/channels/commerce/order-handover-history.reader.ts`                    | 6                                                    | R         | L4                          |
| `handover/domain/entities/order-handover.ts`                                     | 8, 96                                                | R         | L4                          |
| `handover/domain/ports/handover-attestations.reader.ts`                          | 32                                                   | R         | L4                          |
| `handover/domain/services/handover-proof-exhibit.ts`                             | 19, 57                                               | R         | L4                          |
| `handover/domain/services/handover.ts`                                           | 103 « déjà retirée »                                 | R         | L4                          |
| `handover/http/handover.controller.ts`                                           | 49 commentaire                                       | H         | aucun                       |
| `handover/infrastructure/prisma-attested-handovers.reader.ts`                    | 27                                                   | R         | L4                          |
| `handover/infrastructure/prisma-handover-attestations.reader.ts`                 | 27                                                   | R         | L4                          |
| `handover/infrastructure/prisma-handover-proof.reader.ts`                        | 53                                                   | R         | L4                          |
| `handover/infrastructure/prisma-order-handover-history.reader.ts`                | 31                                                   | R         | L4                          |
| `handover/infrastructure/prisma-order-handover.repository.ts`                    | 49                                                   | R         | L4                          |

**Bilan** (compté sur ce tableau) : 140 fichiers — **R** 44 (+ 4 « 1ʳᵉ
remise », inchangés par le choix 8), **S** 14, **J** 22, **D** 38, **H** 10,
et 8 à deux ou trois classes. **69 ne sont touchés par aucun lot** pour ces
jetons (dont 3 « hors plan », au rang 1 comme l'avertissement de retard du §5,
et 3 que LB touche pour le manque) ; L4 en touche 27, L5 26, L7 21, L2 4,
L3 3, L1 1 (un fichier peut compter pour deux lots). Les 38 fichiers **D**
seuls n'ont aucun lot : la date demandée n'est jamais à basculer. Le nombre
réel de lecteurs que L5 touche, inconnu au risque 2 du §4, est **26**.

## Annexe C — les lecteurs du manque de la commande (L0, 2026-10-25)

Méthode : `grep -rl` des colonnes `shortfall_*` d'`orders`
(`shortfallReportedAt`, `shortfallLines`, `shortfallClearedAt`,
`shortfallDecidedAt`, et leurs formes SQL), de la relation
`shortfallDecision` et de `order_shortfall_decision`, hors tests.

🔴 **Le compte « 27 » était faux, et pas d'un fichier** : les **7** fichiers
de `packing/` qu'il comptait (huit au jeton, dont un commentaire) lisent les colonnes **du colisage**
(`packing_order.shortfall_reported_at`, `shortfall_authorized_at`,
`prisma/schema/packing.prisma:48-52`), pas celles d'`orders`. Ils ne sont
pas des lecteurs du manque **du commerce** : ils deviennent par envoi d'eux-mêmes
quand `packing_order` prend `rank` dans sa clé (L3). Ils sortent de LB. Le
compte juste est **21** : 19 sous `b2b/` (la liste du plan était juste) et 2
sous `dev/` (`purge-coverage.ts` manquait).

| Fichier (`src/`)                                                    | Ligne lue                                            | Lot |
| ------------------------------------------------------------------- | ---------------------------------------------------- | --- |
| `b2b/orders/application/queries/get-day-supervision.handler.ts`     | 76, 83 `shortfallReportedAt`                         | LB  |
| `b2b/orders/domain/ports/day-supervision.reader.ts`                 | 19, 26                                               | LB  |
| `b2b/orders/domain/services/day-supervision.ts`                     | 189                                                  | LB  |
| `b2b/orders/infrastructure/handover-order.query.ts`                 | 132 `shortfallLines`                                 | LB  |
| `b2b/orders/infrastructure/prisma-admin-order-list.reader.ts`       | 21, 22                                               | LB  |
| `b2b/orders/infrastructure/prisma-day-supervision.reader.ts`        | 20                                                   | LB  |
| `b2b/orders/infrastructure/prisma-order-shortfall.reader.ts`        | 21                                                   | LB  |
| `b2b/orders/infrastructure/prisma-order-shortfall.repository.ts`    | 34, 35 (et `shortfallLinesOf`, importé par six)      | LB  |
| `b2b/orders/infrastructure/prisma-shortfall-aftermath.reader.ts`    | 39 `shortfallDecidedAt: { not: null }`               | LB  |
| `b2b/orders/infrastructure/prisma-shortfall-decision.reader.ts`     | `prisma.orderShortfallDecision`                      | LB  |
| `b2b/orders/infrastructure/prisma-shortfall-decision.repository.ts` | 27                                                   | LB  |
| `b2b/orders/infrastructure/prisma-shortfall-letter.reader.ts`       | 24                                                   | LB  |
| `b2b/orders/infrastructure/prisma-shortfall-notice.repository.ts`   | 20 `FOR UPDATE … WHERE "order_id"` (SQL)             | LB  |
| `b2b/orders/infrastructure/revisable-order.row.ts`                  | 90                                                   | LB  |
| `b2b/orders/infrastructure/prisma-order-billing.repository.ts`      | 21, 33 `partial`                                     | LB  |
| `b2b/orders/infrastructure/prisma-order-plan-release.ts`            | 35 `shortfallDecision: { is: null }`                 | LB  |
| `b2b/accounting/infrastructure/billable-invoice-order.mapper.ts`    | 51, 98 `partial`                                     | LB  |
| `b2b/accounting/infrastructure/billable-order-criterion.ts`         | 115 `remainder`                                      | LB  |
| `b2b/accounting/infrastructure/prisma-monthly-invoicing.reader.ts`  | 56                                                   | LB  |
| `dev/scenario/purge/commerce.purge.ts`                              | 59 `orderShortfallDecision.deleteMany`               | LB  |
| `dev/scenario/purge/purge-coverage.ts`                              | 60, 69 (la table neuve `order_shortfall` s'y ajoute) | LB  |

Sortis de LB, touchés par L3 seulement : `packing/application/station/close-packing-order.handler.ts`,
`packing/channels/commerce/packing-shortfall-cleared.event.ts` (commentaire),
`packing/domain/entities/packing-sheet.snapshot.ts`, `packing/domain/entities/packing-sheet.ts`,
`packing/domain/ports/packing-board.reader.ts`, `packing/domain/services/packing-board-sheet.ts`,
`packing/infrastructure/prisma-packing-board.reader.ts`, `packing/infrastructure/prisma-packing-sheet.repository.ts`.

## Annexe D — les faits de départ, de retirage, et `deliveryOrderIds` (L0, 2026-10-25)

Méthode : `grep -rl` de `ProductionDayRetakenEvent`, `DeliveryRoundDepartedFact`,
`DeliveryOrdersBroughtBackFact`, `deliveryOrderIds`. **20 fichiers au jeton,
15 porteurs** (le plan disait 12) : les trois `index.ts` de canal ne font que
réexporter, et `delivery/channels/commerce/transfer-{departed,received}.fact.ts`
ne citent le fait qu'en commentaire. Tous sont **L3** (choix 12).

| Fichier (`src/`)                                                         | Ligne lue                                      | Rôle                    |
| ------------------------------------------------------------------------ | ---------------------------------------------- | ----------------------- |
| `production/channels/delivery/production-day-retaken.event.ts`           | 46 clé, `orderIds` du payload                  | définition              |
| `production/application/commands/retake-production-day.handler.ts`       | 126                                            | émetteur                |
| `delivery/application/handlers/learn-retaken-plan.handler.ts`            | 56-57 `fromPayload`, `event.orderIds`          | lecteur                 |
| `production/application/handlers/send-dossier-on-day-retaken.handler.ts` | 47 `fromPayload`                               | lecteur (jour seul)     |
| `delivery/channels/handover/delivery-round-departed.fact.ts`             | 43                                             | définition              |
| `delivery/application/delivery-departure-support.ts`                     | 112                                            | émetteur                |
| `b2b/orders/application/handlers/mail-delivery-en-route.handler.ts`      | 64, 73                                         | lecteur (courriel, L4)  |
| `handover/application/handlers/record-round-departed.handler.ts`         | 42-43 `handedOverAmong(fact.orderIds)`         | lecteur                 |
| `delivery/channels/handover/delivery-orders-brought-back.fact.ts`        | 34                                             | définition              |
| `delivery/application/commands/bring-stop-back.handler.ts`               | 62 `[at.decision.orderId]`                     | émetteur                |
| `delivery/application/stop-decision-by-setting.ts`                       | 88 `[report.stop.orderId]`                     | émetteur (**manquait**) |
| `handover/application/handlers/record-orders-brought-back.handler.ts`    | 33 `recordReturned(fact.orderIds, …)`          | lecteur                 |
| `delivery/domain/entities/delivery-day-readiness.ts`                     | 8, 55, 69                                      | `deliveryOrderIds`      |
| `delivery/infrastructure/prisma-delivery-day-readiness.reader.ts`        | 23, 33 `orderId: { in: row.deliveryOrderIds }` | `deliveryOrderIds`      |
| `delivery/infrastructure/prisma-delivery-day-readiness.repository.ts`    | 49                                             | `deliveryOrderIds`      |

## Annexe E — les lecteurs du jeton de retrait (L0, 2026-10-25)

Méthode : `grep -rl` de `handoverToken` / `handover_token`. **12 fichiers,
11 porteurs** (le plan disait 10) ; `b2b/orders/domain/services/handover.ts`
ne le cite qu'en commentaire. Le jeton reste **un par commande** (choix 13) :
la plupart n'ont rien à changer.

| Fichier (`src/`)                                                    | Ligne lue                   | Lot                               |
| ------------------------------------------------------------------- | --------------------------- | --------------------------------- |
| `b2b/orders/infrastructure/prisma-handover-subject.reader.ts`       | 51 scan → **commande**      | L4 (rendre les envois prêts)      |
| `b2b/orders/infrastructure/packing-order-bag-label.reader.ts`       | 34 QR de l'étiquette du sac | L4 (même QR sur le sac du rang 2) |
| `b2b/orders/application/services/order-ready-mail.service.ts`       | 82                          | L4 (courriel « prête » par envoi) |
| `b2b/orders/infrastructure/prisma-order.repository.ts`              | 107 émission à la passation | aucun                             |
| `b2b/orders/infrastructure/prisma-order.reader.ts`                  | 82, 129                     | aucun                             |
| `b2b/orders/application/handlers/send-order-placed-mail.handler.ts` | 139                         | aucun                             |
| `b2b/orders/application/services/order-placed-mail.service.ts`      | 90                          | aucun                             |
| `b2b/orders/application/services/order-sheet-archive.service.ts`    | 95, 99                      | aucun                             |
| `b2b/orders/application/services/order-sheet-attachment.service.ts` | 29, 32                      | aucun                             |
| `platform/mailer/mail-templates.ts`                                 | 94, 211                     | aucun                             |
| `platform/mailer/specimens/order-specimens.ts`                      | 95, 107                     | aucun                             |
| `b2b/orders/domain/services/handover.ts`                            | commentaire                 | aucun                             |

Côté écran (hors compte backend) : `handover-shop/scan-dialog/` et
`handover-shop/sheet-panel/` du back-office, L4.

## Annexe F — les listes de statuts face à `partially_handed_over` (L0, 2026-10-25)

Méthode : chaque énumération explicite de `OrderStatus` (tableau, `Set`,
`in` / `notIn`, `switch`, `Record`) dans `apps/lfd-api/src`, `packages/` et les
deux fronts. « Compilateur » = un `Record<OrderStatus, …>` ou une union
fermée : ajouter la valeur à l'énum fait échouer le typecheck jusqu'à ce qu'on
tranche. « Silencieux » = rien ne rougira.

| Liste                                                                                                                                                                                            | Aujourd'hui                                      | Face à `partially_handed_over`                                                                                                                                                                                                       | Lot       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `b2b/orders/domain/services/order-cancellation.ts:215-225`                                                                                                                                       | `switch` du statut, **`default: return null`**   | 🔴 **silencieux et dangereux** : la commande deviendrait annulable (la révision en hérite) ; seule la mise à jour conditionnée de `prisma-order-cancellation.repository.ts:25` (`placed`/`confirmed`) refuserait, avec un refus muet | L5        |
| `b2b/account/infrastructure/prisma-customer-sheet.reader.ts:35`                                                                                                                                  | CA : placed, confirmed, in_production, fulfilled | silencieux : l'ajouter                                                                                                                                                                                                               | L5        |
| `b2b/alerts/infrastructure/prisma-order-history.reader.ts:20`                                                                                                                                    | idem                                             | silencieux : l'ajouter                                                                                                                                                                                                               | L5        |
| `b2b/growth/domain/revenue-scope.ts:9`                                                                                                                                                           | idem                                             | silencieux : l'ajouter                                                                                                                                                                                                               | L5        |
| `b2b/pricing/infrastructure/prisma-customer-volume.reader.ts:17`                                                                                                                                 | idem                                             | silencieux : l'ajouter                                                                                                                                                                                                               | L5        |
| `b2b/pricing/infrastructure/prisma-sku-volume.reader.ts:18`                                                                                                                                      | idem                                             | silencieux : l'ajouter                                                                                                                                                                                                               | L5        |
| `b2b/delivery-notes/domain/services/delivery-note-terms-control.ts:6`                                                                                                                            | confirmed, ready, fulfilled                      | silencieux : l'ajouter (BL-1 contrôlé comme sous `fulfilled`)                                                                                                                                                                        | L5        |
| `b2b/delivery-notes/domain/services/delivery-note-alignment.ts:10, 249-253`                                                                                                                      | union fermée + `switch`                          | compilateur : même cible que `fulfilled` pour le BL-1                                                                                                                                                                                | L2        |
| `b2b/orders/domain/ports/order-progress-for-delivery-note.ts:5`                                                                                                                                  | union fermée                                     | compilateur                                                                                                                                                                                                                          | L2        |
| `b2b/orders/infrastructure/prisma-orders-to-reconcile-delivery-notes.ts:18`                                                                                                                      | confirmed, ready, fulfilled, in_production       | silencieux : l'ajouter                                                                                                                                                                                                               | L2        |
| `b2b/orders/domain/ports/site-arrival-orders.reader.ts:28` `STATUSES_AWAITING_PICKUP`                                                                                                            | placed, confirmed, in_production, ready          | silencieux : l'ajouter (un reste attend encore son retrait) ; le lit aussi `prisma-deadline-orders.reader.ts:33`                                                                                                                     | L7        |
| `b2b/orders/domain/services/day-supervision.ts:51`                                                                                                                                               | `Record<OrderStatus, …>`                         | compilateur ; et `packages/contracts/src/day-supervision.ts:35` (étapes)                                                                                                                                                             | L5        |
| `b2b/orders/infrastructure/prisma-day-supervision.reader.ts:105`                                                                                                                                 | `notIn` draft, fulfilled, cancelled              | silencieux : l'inclut déjà (voulu : un reste est à superviser)                                                                                                                                                                       | aucun     |
| `b2b/orders/infrastructure/prisma-delivery-order-states.reader.ts:38`                                                                                                                            | ready, fulfilled ; état **par commande**         | silencieux, et faux par construction : un BL-2 d'une commande partielle se lirait « remis » ; à passer par envoi                                                                                                                     | L3, L4    |
| `b2b/orders/infrastructure/prisma-pending-orders.reader.ts:66, 76`                                                                                                                               | listes du retard de colisage et de remise        | silencieux : `behindOnHandover` doit l'inclure                                                                                                                                                                                       | L5        |
| `b2b/orders/infrastructure/prisma-order.repository.ts:329` (`markReady`)                                                                                                                         | `notIn` cancelled, draft, fulfilled              | silencieux : l'exclure aussi (un rang 1 remis n'est plus « prêt »)                                                                                                                                                                   | L4        |
| `b2b/orders/domain/services/packing.ts:43-46`                                                                                                                                                    | `fulfilled`, puis `readyAt !== null`             | le rang 2 ne passe pas par là (choix 4)                                                                                                                                                                                              | L4        |
| `b2b/orders/application/services/delivery-en-route-mail.service.ts:70`                                                                                                                           | `!== fulfilled && handedOverAt === null`         | bloquerait le courriel du rang 2 (choix 17)                                                                                                                                                                                          | L4        |
| `b2b/contact/infrastructure/order-reportable-order.reader.ts:44`                                                                                                                                 | `=== "fulfilled"`                                | décider si on signale un problème sur une partie reçue                                                                                                                                                                               | L5        |
| `b2b/orders/domain/entities/order-billing.ts:144, 164`                                                                                                                                           | `fulfilled` seul                                 | voulu (choix 18)                                                                                                                                                                                                                     | aucun     |
| `b2b/orders/domain/entities/order-customer-nudges.ts:143`                                                                                                                                        | `fulfilled \|\| handedOverAt`                    | rang 1                                                                                                                                                                                                                               | hors plan |
| `b2b/orders/infrastructure/prisma-order.reader.ts:295`, `prisma-transfer-orders.reader.ts:14`, `dev/seeding/invoice-handovers.seed.ts:71`                                                        | `notIn` cancelled, draft                         | l'incluent déjà, à raison                                                                                                                                                                                                            | aucun     |
| `b2b/orders/infrastructure/prisma-order-revision.repository.ts:23`, `prisma-order-cancellation.repository.ts:25`                                                                                 | placed / confirmed                               | l'excluent déjà, à raison                                                                                                                                                                                                            | aucun     |
| `packages/contracts/src/order.ts:51`                                                                                                                                                             | l'énum du contrat                                | la valeur s'y ajoute                                                                                                                                                                                                                 | L5        |
| `packages/contracts/src/customer-cancellation.values.ts:37`, `order-revision.values.ts:40`                                                                                                       | motifs de refus `fulfilled`                      | un motif pour la commande remise en partie                                                                                                                                                                                           | L5        |
| `packages/b2b-ui/src/order/order-timeline.ts:84`, `order-format.ts:32`                                                                                                                           | `Record<OrderStatus, …>`                         | compilateur : rang et libellé                                                                                                                                                                                                        | L5        |
| `apps/lfc-ecommerce-frontend/src/app/client/mes-commandes/order-rows.ts:329, 486`, `order-revision/revision-wording.ts:43`, `order-cancellation/order-cancel-section/order-cancel-section.ts:39` | comparaisons à `'fulfilled'`                     | silencieux côté client                                                                                                                                                                                                               | L5        |

Les autres `'fulfilled'` des fronts (`pending-access.service.ts`,
`storefront-persistence.ts`, trois pages de `livraison/`) sont des
`Promise.allSettled` : hors sujet.

**Constat hors plan** : les cinq listes « chiffre d'affaires » ci-dessus
omettent toutes `ready` — une commande prête n'entre pas dans le CA, le
volume ni l'historique d'alertes, alors qu'elle y était `confirmed` la veille.
Ce n'est pas E7 ; c'est à trancher avant L5, qui touche ces cinq listes.
