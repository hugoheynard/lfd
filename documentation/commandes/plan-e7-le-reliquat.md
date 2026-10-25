# Plan E7 (avec E3) — le reliquat : un second bon de livraison pour la même commande

> **Doc-first, 2026-10-25.** Lots E3 + E7 de
> [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md),
> après E6 ([`plan-e6-le-depart-incomplet.md`](plan-e6-le-depart-incomplet.md)) :
> la décision gagne « **reste à relivrer** ». Décisions de Hugo : le reliquat
> est la suite de la **même** commande, aux mêmes prix ; sa date est choisie
> par le commercial ; le cas courant est une **seconde livraison le jour même**.
> Choix de conception : l'assistant. Touche plusieurs blocs, l'argent (le
> solde) et des clés en base : `vitruve` avant le bâti. **Rien n'est bâti.**

## 0. Ce qui existe (ouvert le 2026-10-25)

| Où                                | Clé                                                                                                                                  | Effet sur un reliquat                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Fournil — `production_order`      | `@@unique([serviceDay, orderId])` (`prisma/schema/production.prisma`)                                                                | un **autre** jour : passe ; le **même** jour : refusé       |
| Colisage — `packing_order`        | `@@id([serviceDay, orderId])` (`prisma/schema/packing.prisma`)                                                                       | idem                                                        |
| Retrait — `order_handover`        | `orderId @unique` (`prisma/schema/production.prisma`, bloc `handover`)                                                               | **refusé**, quel que soit le jour                           |
| Livraison — `delivery_round_stop` | `orderId` nullable, indexé, sans unicité (`prisma/schema/delivery.prisma`)                                                           | passe                                                       |
| Commerce — la commande            | `handed_over_at` / `received_on` posés à la première remise, deux CHECK (B4) ; `fulfilled` à la remise                               | une commande « remise » au BL-1 a encore un reste           |
| Ajout au plan arrêté              | le **retirage** (`RetakeProductionDayHandler`) absorbe des commandes `placed` et publie `production.packing_list_drawn` par commande | modèle à suivre, mais il ne vise que des commandes `placed` |

## 1. Le modèle

- **Le BL-2** naît à la décision « reste à relivrer » (date D2 choisie), état
  `planned`, aux quantités du reste, montants par la fabrique d'E6c1 (les
  ajustements en pourcentage réappliqués ; montants fixes, port et surtaxe à
  zéro — Q-I2 de Hugo).
- **La commande** reste `ready`/`confirmed` tant qu'un BL n'est pas remis ;
  elle passe `fulfilled` **à son solde** (dernier BL remis), pas au premier.
  `handed_over_at` / `received_on` gardent la **première** remise (B4 tient,
  colonne figée) ; « Reçue le » à l'écran = dernier BL (Q-E2).
- **Le QR reste celui de la commande** (Q-E1) : au comptoir comme à la porte,
  le scan remet **le BL prêt**.

## 2. Les lots

| Lot     | Contenu                                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E3**  | Le retrait par BL : `order_handover` clé par **BL** (commande + rang), le refus « déjà retirée » et les preuves à la porte par BL ; la commande `fulfilled` au solde ; « Reçue le » dérivé du dernier BL |
| **E7a** | Le reliquat **un autre jour** : « reste à relivrer » (date D2 > D1), BL-2, inscription au plan de D2 (fournil et colisage, clés existantes suffisantes), arrêt de tournée du BL-2, solde au BL-2         |
| **E7b** | Le reliquat **le même jour** : clés `production_order` et `packing_order` élargies au rang du BL (migration de clé, trois temps), ajout au jour arrêté sur le modèle du retirage, seconde préparation    |

## 3. Questions laissées au plan de bâti

- Le retrait d'un BL-2 à la porte quand le BL-1 a été déposé sans personne.
- La facture d'une commande dont le BL-2 tombe le mois suivant : au mois du
  solde (Q-E6-3), déjà décidé.
- Le reliquat abandonné **après** décision « à relivrer » (E8).

## 4. Contradiction de `vitruve` (2026-10-25) et choix de Hugo — l'emporte sur les § 0 à § 3

**Ce que `vitruve` a montré** : le reliquat comme « second BL de la même
commande » n'est pas un lot, c'est un **cycle de vie par BL**.

- **Quatre clés** imposent une remise par commande, pas une :
  `order_handover.orderId @unique` **et** `order_handover.reference @unique`,
  `OrderHandoverProof.orderId @id`, `OrderDeparture.orderId @id`
  (`prisma/schema/production.prisma`).
- **La commande ne redevient jamais prête et ne se remet qu'une fois** :
  `markReady` écrit sous `readyAt: null`, `markFulfilled` sous
  `handedOverAt: null` et pose `fulfilled` (`prisma-order.repository.ts`).
- **Un reliquat un autre jour n'est vu par aucune source du jour** : plan,
  fiche d'atelier, supervision, composition des tournées sélectionnent par
  `requestedDeliveryDate` (60 fichiers hors tests le lisent).
- **« `fulfilled` au solde »** change le sens pour 22 fichiers (`fulfilled`) et
  45 (`handedOverAt`) : facturation, fidélité, volumes, supervision, courriels,
  annulation, révision…

**Hugo, 2026-10-25 : « A »** — le modèle complet, un cycle de vie par BL, plutôt
qu'une commande de suite. Le reliquat reste **la même commande**.

## 5. Le programme E7 (cycle de vie par BL)

Chaque BL porte **son jour de service**, **son état** (prévu, préparé, remis)
et **sa remise** ; la commande en **dérive** son avancement. Lots, dans
l'ordre, chacun avec son plan, son recensement et `vitruve` :

| Lot      | Contenu                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E7.0** | Les recensements, écrits avant tout code : les 60 lecteurs de `requestedDeliveryDate` classés « ce qu'on fabrique / colise / livre le jour D » (basculent sur le jour du BL) ou « la date demandée par le client » (restent) ; les 22 lecteurs de `fulfilled` et les 45 de `handedOverAt` classés « remise de quelque chose » / « commande soldée » ; les huit adaptateurs du bloc `handover` |
| **E7.1** | Le jour de service sur le BL (`delivery_note.service_day`, = jour demandé pour le BL-1) ; les sources « du jour D » lisent les BL du jour                                                                                                                                                                                                                                                     |
| **E7.2** | L'état de la commande dérivé de ses BL : un état « en partie remise », la commande `fulfilled` au solde ; annulation et révision refusées dès qu'un BL est remis                                                                                                                                                                                                                              |
| **E7.3** | Le retrait par BL (E3) : `order_handover`, sa référence, la preuve, le départ, clés par BL (migrations de clé en trois temps) ; le scan du QR de commande remet **le BL prêt** (un seul prêt à la fois, sinon le comptoir choisit)                                                                                                                                                            |
| **E7.4** | La préparation par BL : `production_order` et `packing_order` clés par BL ; un BL-2 entre au plan de son jour, y compris un jour déjà arrêté (sur le modèle du retirage)                                                                                                                                                                                                                      |
| **E7.5** | « Reste à relivrer » dans la décision : BL-2, sa date, ses montants (pourcentages réappliqués, fixes à zéro) ; le solde à la remise du dernier BL                                                                                                                                                                                                                                             |

**Irréversible, dit ici** : dès qu'un BL-2 est remis en production, les clés
« une remise par commande » ne se resserrent plus.

**E7.0 fait le 2026-10-25** : [`e7-recensement.md`](e7-recensement.md) — le classement des lecteurs et les huit cas ambigus tranchés.
