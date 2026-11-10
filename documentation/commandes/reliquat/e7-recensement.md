# E7.0 — le recensement du cycle de vie par bon de livraison

> **2026-10-25.** Lot E7.0 du programme
> [`plan-e7-le-reliquat.md`](plan-e7-le-reliquat.md) (§ 5) : avant tout code,
> chaque lecteur de la date de commande, du statut « remise » et de la date de
> remise est classé selon ce qu'il veut dire. Recensement fait par une
> exploration en lecture seule (`apps/lfd-api/src`, hors tests et client
> généré), **trois affirmations revérifiées à la main** le même jour
> (`listForProduction` filtre par `requestedDeliveryDate`, `packing.ts:43`
> refuse `fulfilled`, `findByOrderId` lit `order_handover` par `orderId`). La
> catégorie repose sur la ligne qui matche : chaque lot la **rouvre** avant de
> changer un fichier. Règle de Hugo : **se rapprocher le plus de la réalité**.

## 1. `requestedDeliveryDate` (≈ 60 fichiers)

**JOUR — basculent sur le jour du BL (E7.1)** : ce qu'on fabrique, colise,
livre ou retient **ce jour-là**. `prisma-order.reader.ts` (`listForProduction`,
`findForPacking`), `prisma-day-orders.source.ts`,
`prisma-expected-production.reader.ts`, `prisma-day-supervision.reader.ts`,
`prisma-site-arrival-orders.reader.ts`, `prisma-order-plan-release.ts`,
`prisma-delivery-orders.reader.ts`, `prisma-transfer-orders.reader.ts`,
`prisma-deadline-orders.reader.ts`, `get-packing.handler.ts`,
`prisma-unconfirmed-deliveries.reader.ts`, `handover/…/quality-hold.ts`,
`handover-departure-holds.ts`, `handover/channels/commerce/delivery-run-sheet.reader.ts`.
La passation (`place-*.handler.ts`, `order-drafting.service.ts`,
`order-revising.service.ts`) **réserve le jour du BL-1** au plan : elle reste
sur la date demandée, qui **est** le jour du BL-1.

**DEMANDE — restent sur la commande** : ce que le client a demandé — listes et
résumés de commande, annulation, révision et son historique, avis, historique
d'achat, devis, fiche (confirmation de commande), empreinte d'idempotence,
spécimens, dossier et CSV de facturation (date demandée reportée).

**LES DEUX** : l'agrégat `Order`, ses dépôts, `order-composition.service.ts`, le
semis — ils **écrivent** la date demandée ; le jour du BL-1 en est la copie.

## 2. `fulfilled` (≈ 50 fichiers)

**REMISE — « quelque chose a été remis » → l'événement devient « un BL est
remis »** : `markFulfilled` et son fait, l'abonné growth, la réconciliation
des BL, `delivery-order-states`, la supervision, l'alignement des BL, le
courriel « en route ».

**SOLDÉE — « plus rien à faire » → la commande `fulfilled` au solde** :
commandes définitives (`completed-order`), en retard (`pending-orders`), ce
qui reste à faire (`day-supervision`, `markReady`), arrivées sur site,
historique compté.

**VERROU — gardes** : annulation (staff, client), révision, colisage refusés
**dès qu'un BL est remis** (pas seulement au solde) ; signaler un problème
ouvert **dès un BL remis** ; facturation **au solde**.

## 3. `handedOverAt` (≈ 45 fichiers)

**PREMIÈRE REMISE** : la colonne de la commande garde la première (B4, figée) ;
ses lecteurs d'affichage la gardent. Le bloc `handover` (agrégat
`OrderHandover`, attestations, preuves, historique, file de retrait, faits)
passe **par BL** (E7.3). **VERROU** : « déjà retirée » devient « ce BL est déjà
remis » ; `markFulfilled` conditionné par BL ; facture carte à la remise
(carte exclue du départ incomplet : première remise = solde).

## 4. Les tables du bloc `handover` (11 adaptateurs)

Tous clés par `orderId` : `prisma-order-handover.repository.ts`,
`prisma-handover-proof.repository.ts`, `prisma-handover-proof.reader.ts`,
`prisma-handover-proof.eraser.ts`, `prisma-order-departure.repository.ts`,
`prisma-order-custody.reader.ts`, `prisma-order-handover-history.reader.ts`,
`prisma-handover-attestations.reader.ts`, `prisma-handed-over-orders.reader.ts`,
`prisma-attested-handovers.reader.ts` (par instant), plus la purge et le semis
de dev. **Tous passent par BL en E7.3.**

## 5. Les cas ambigus — tranchés par l'assistant (2026-10-25)

| Cas                                                                             | Décision                                        | Raison (le réel)                                                                  |
| ------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `prisma-deadline-orders.reader.ts`                                              | **JOUR**                                        | le compte à rebours du fournil, c'est ce qui doit sortir ce jour-là               |
| `prisma-unsettled-settlement.reader.ts`                                         | **DEMANDE**                                     | le règlement est celui de la commande, pas d'un envoi                             |
| `order-revision.ts` (changement de jour)                                        | **commande** ; révision refusée dès un BL remis | on ne modifie pas une commande dont une partie est livrée                         |
| `billing-statement.ts`, `invoice-lines.ts`, `prisma-procedure-orders.reader.ts` | **commande, au solde** (`settled_on`, E6c2)     | une commande, une facture                                                         |
| `credit-points-on-handover`, `issue-card-invoice-on-fulfilled`                  | **au solde**                                    | les points récompensent ce qui a été livré ; la carte n'a pas de départ incomplet |
| `revenue-scope.ts`, volumes de prix                                             | **au solde**, sur le livré                      | le chiffre d'affaires est ce qui a été livré                                      |
| `prisma-attested-handovers.reader.ts`                                           | **par BL** (chaque remise est un événement)     | chaque envoi est une remise réelle                                                |
| `monthly-invoicing.ts` (mois)                                                   | **`settled_on`** (déjà E6c2)                    | décision Q-E6-3                                                                   |
