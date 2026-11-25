# Inventaire B5 — retirer le second envoi

> Lot B5 de [`plan-reliquat-de-commande.md`](plan-reliquat-de-commande.md)
> (décision 6 de Hugo, 2026-11-25 : `planRemainder` et les BL de rang > 1
> sont du code mort à retirer). Inventaire dressé le 2026-11-25 sur le code
> du worktree (B1 à B4 bâtis), soumis à `vitruve` avant tout démontage.

## Partie 1 — En clair

Le système savait fabriquer un **second envoi** de la même commande (un BL de
rang 2, avec son jour, son colisage, son retrait et le solde à la dernière
remise). Aucun geste ne l'a jamais créé : seul un test appelait
`planRemainder`. Le reliquat de commande (B1 à B4) le remplace : le reste
devient une **nouvelle commande**. On retire donc le second envoi, sans
toucher à ce que le premier envoi (le rang 1, c'est-à-dire la commande
elle-même) traverse.

Trois règles :

1. **Rien en base ne bouge.** Aucune migration : les colonnes `rank`,
   `delivery_note.service_day`, la valeur `partially_handed_over` et les
   faits passés restent, morts. Une valeur d'énumération ne se retire pas
   sans recréer le type.
2. **Le rang 1 reste partout.** `ShipmentRef` et `shipmentKeySuffix`
   (`production/day/domain/value-objects/shipment-ref.value-object.ts:84-86`)
   gardent les clés de la boîte d'envoi identiques : on ne les simplifie pas.
3. **On retire ce qui n'existe que pour le rang > 1**, et on simplifie ce
   qui portait une branche pour lui.

## Partie 2 — Technique

### 0. La précondition : aucun second envoi n'existe

Dans le code, le seul écrivain d'un BL de rang > 1 est `planRemainder`
(`lafoliecoffee/delivery-notes/domain/entities/delivery-note.ts:157-186`),
appelé par les seuls tests. Donc aucun BL de rang > 1, aucune commande
`partially_handed_over` (seul `statusAfterFirstHandover` l'écrit, quand un
BL de rang > 1 attend : `orders/infrastructure/prisma-pending-remainders.reader.ts:23-31`),
aucun fait de reste en file. **Non vérifié en base** : la requête de
contrôle, en lecture seule, est pour Hugo avant un déploiement :

```sql
SELECT
  (SELECT count(*) FROM public.delivery_note WHERE rank > 1) AS bl_reste,
  (SELECT count(*) FROM public.orders WHERE status = 'partially_handed_over') AS en_partie,
  (SELECT count(*) FROM public.order_shortfall_decision WHERE rank > 1) AS decisions_reste;
```

Trois zéros attendus. Sinon, le démontage attend. Elle ne compte pas un BL
de rang > 1 annulé, et n'en a pas besoin. Ce contrôle est une discipline,
pas une porte : il se lance avant le déploiement qui porte B5.

**La boîte d'envoi** (`vitruve`, bloquant) : à la publication, chaque fait
crée une livraison par abonné inscrit (`platform/outbox/prisma-outbox.ts:41-52`),
et une livraison dont l'abonné n'est plus inscrit échoue jusqu'à la lettre
morte (`platform/outbox/outbox-relay.ts:81-84`). Les faits
`packing.order_packed` et `handover.handed_over` restent publiés au rang 1 :
retirer leurs deux abonnés de reste (`b2b.delivery-notes.prepare-remainder`,
`b2b.delivery-notes.hand-over-remainder`) ferait tomber en lettres mortes
toute livraison en vol au déploiement. **Tranché** : les deux abonnés
**restent inscrits, muets** (un `handle` qui rend la main, avec sa raison
écrite), et ne sortent du code qu'au lot suivant, une fois la file vide
constatée par Hugo :

```sql
SELECT subscriber, count(*) FROM platform.outbox_delivery
WHERE subscriber IN ('b2b.delivery-notes.prepare-remainder','b2b.delivery-notes.hand-over-remainder')
  AND delivered_at IS NULL GROUP BY 1;
```

### 1. Retiré

| Bloc            | Fichiers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BL, domaine     | `planRemainder` et son import (`delivery-note.ts:19, 157-186`) ; remainder-schedule (retiré en B5a) ; remainder-decision-source (retiré en B5a) ; `remainderDiscountsOf` (`services/note-basket-discounts.ts:47-51` — le rejeu du reliquat porte sa propre règle, `orders/backorder/domain/services/backorder-replay.ts:43`) ; erreurs `InvalidDeliveryNoteRemainderError`, `RemainderNoteNotFoundError`, `HandedOverRemainderNoteNotFoundError`                                                                                                                                                                                                                                                                                                                                                                 |
| BL, application | `prepare-remainder-note.{command,handler}.ts`, `hand-over-remainder-note.{command,handler}.ts`, remainder-note-of (retiré en B5a), remainder-decision-follower (retiré en B5a) (et son injection dans `DeliveryNoteFollower`, `delivery-note-follower.ts:32`) ; `on-remainder-packed.handler.ts` et `on-remainder-handed-over.handler.ts` **deviennent muets** (§ 0), ils ne sont pas retirés ; leurs entrées dans `delivery-notes.module.ts`                                                                                                                                                                                                                                                                                                                                                                    |
| Commandes       | `order-remainder-settler.ts` ; ports `remainder-settlement.ts`, `remainder-shipment.reader.ts`, `pending-remainders.reader.ts` et leurs adaptateurs ; la **classe** `RemainderDecisionReader` (son fichier `shortfall-decision.reader.ts` garde `ShortfallDecisionReader`, de même `prisma-shortfall-decision.reader.ts:82`) ; `RemainderNotDecidableError` (`orders/domain/errors/shortfall-decision-errors.ts`) et `ShortfallDecisionSubject.remainderNoteStatus` (`entities/shortfall-decision.ts`) ; `settlesOnRemainder` et `FirstHandoverStatus` (`domain/services/shipment-settlement.ts`) ; le refus `remainder_not_planned` et `DECIDABLE_REMAINDER_NOTE` (`shortfall-decidability.ts`) ; `handover-later-shipments.query.ts` ; leurs entrées dans `orders.module.ts` et `order-shortfall.providers.ts` |
| Retrait         | `remainderReferenceOf` (`handover/domain/services/handover-shipments.ts:80-90`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Back-office     | le choix entre plusieurs envois au comptoir (`handover-shop/shipment-choice/`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### 2. Simplifié (le rang 1 reste)

- **Le BL, partout où une branche suivait le rang** : `delivery-note-discount-parts.ts:10,68` (il importe `remainderDiscountsOf` sur le chemin de **tout** BL : la branche disparaît, le rang 1 garde ses remises), `delivery-note-alignment.ts:122` (`allRanks.filter(followsItsOrder)`), `delivery-note-terms-control.ts:52`, `delivery-note-sheet.ts:196`, `followsItsOrder` (`delivery-note.ts:226-232`).
- `statusAfterFirstHandover` → toujours `fulfilled` ; `mark-order-fulfilled.handler.ts` perd `PendingRemaindersReader`.
- `DeliveryNoteFollower` : `followDecision(orderId)` sans rang ; `voidLiveFor` sans la boucle des restes. `DeliveryNotePlanner.noteFor` et l'alignement : un seul BL suivi.
- Les abonnés de rang 1 `on-packing-order-packed.handler.ts:29,40` et `on-order-handed-over.handler.ts:49-51` gardent leur garde `rank !== 1`, avec un commentaire qui ne renvoie plus aux abonnés de reste.
- `counter-incomplete-handover-preview.ts:35` perd l'entrée `remainder_not_planned` de son `Record` exhaustif.
- Le port `DeliveryNoteFollowing` (côté commandes, `orders/domain/ports/delivery-note-following.ts:47`) perd le rang de `followDecision`.
- La décision du départ : plus de `rank` dans le corps (`admin-order-detail.ts`, `adminShortfallDecisionPayloadSchema`), `shortfall-departure.ts`, `decide-order-shortfall.handler.ts` au rang 1.
- Le retrait : `handover-shipments.ts`, `handover-counter-view.ts`, `handover-attestation.service.ts`, `confirm-handover` et `confirm-manual-handover` avec un seul envoi ; contrats `order-handover.ts` (`shipments`) et `order-handover-confirm.ts` (`ranks`) — contrats servis, cassés dans le même déploiement (pré-release, décision de Hugo pour ce chantier) ; back-office `handover-detail`, `handover-queue.service.ts`, `handover-queue.ts`, `scan-dialog/scan-dialog.ts:203-321` (lit `shipments`, `rank`, `allRanks`, envoie `ranks`), `retrait/handover.service.ts`, `retrait/retrait-page/retrait-page.ts`, et leurs specs (`handover-detail`, `handover-shop-page`, `handover-queue`). Le build AOT du back-office le tient.
- Les courriels « prête » et « en route » : plus de branche de reste
  (`orders/notices/application/services/order-ready-mail.service.ts`,
  `delivery-en-route-mail.service.ts`) ; les textes et spécimens du bloc
  `mail/` (`templates/copy/*/order-mails.*.ts`, `model/order-mails.model.ts`,
  `specimens/cases/order-specimen-cases.ts`) perdent leur variante de reste,
  et les portes `mail-copy-digest` et `pdf-specimens` sont relancées.

### 3. Gardé

- Tout ce qui lit `partially_handed_over` (comptabilité `awaiting_remainder`, annulation, révision, client) : la valeur reste possible en base pour l'histoire. Trois points portent une transition et pas une lecture — `prisma-order.repository.ts:413`, `mark-order-ready.handler.ts:174`, `delivery-note-alignment.ts:271` — : gardés aussi, pour la même raison (un état inatteignable n'y passe jamais). `awaitsRemainder` (`accounting/infrastructure/billable-order-criterion.ts:125-131`) a une branche « décision ≠ abandoned » morte tant que `shortfallRemainderSchema` vaut `abandoned` seul : signalée, gardée.
- Les colonnes et faits portant `rank` au fournil, au colisage, à la livraison, au retrait ; `ShipmentRef`, `shipmentKeySuffix`, `FIRST_*_RANK`.
- Les arrêts de tournée par rang (`delivery.prisma:227`) : L7-L8 est abandonné, la colonne vaut 1.
- Toutes les migrations.

### 3 bis. Les e2e

Un e2e n'est pas colocalisé : il se décide un par un. Portent du rang > 1 ou
des `ranks` : `remainder-settlement`, `delivery-notes-ranks`,
`delivery-notes-service-day`, `shipment-rank-handover`,
`shipment-rank-sheets`, `handover-by-shipment`, `handover-shipments-counter`,
`shortfall-by-shipment`, `delivery-shipment-ranks`,
`delivery-notes-discounts`, `invoice-basket-discounts`,
`order-discounts-read`, `packing-bag-labels`. Règle : une suite qui
n'éprouve **que** le second envoi part ; une suite qui éprouve aussi le
rang 1 perd ses cas de rang > 1 et garde les autres — ce sont elles qui
prouvent que le rang 1 reste.

### 3 ter. La doc

`reliquat.md` (§ 6 décrit le second envoi), `plan-e9-reste-carte.md` et
`documentation/commandes/domaines-a-decouper.md` se réécrivent au présent dans le
même lot que le code : la clôture du chantier.

### 4. Lots

| Lot | Contenu                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| B5a | BL : domaine et application — **après le commit de B4b**, qui touche `delivery-note.ts`, `delivery-notes.module.ts` et `delivery-note-errors.ts` |
| B5b | commandes : solde, décision, courriels                                                                                                           |
| B5c | retrait et contrats, back-office                                                                                                                 |

Chaque lot : les tests des fichiers retirés partent avec eux ; les specs qui
portaient un cas de rang > 1 le perdent ; les portes `durable-cross-block`
(abonnés retirés) et `shop-copy-digest` / `mail-copy-digest` (un texte qui
disparaît) sont relancées.
