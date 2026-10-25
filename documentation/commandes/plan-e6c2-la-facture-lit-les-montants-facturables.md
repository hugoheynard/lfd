# Plan E6c2 — la facture et le prélèvement lisent les montants facturables

> **Doc-first, 2026-10-25.** Dernier temps d'E6
> ([`plan-e6-le-depart-incomplet.md`](plan-e6-le-depart-incomplet.md) § 12-13) :
> E6c1 pose `orders.billable_*` et `settled_on` en ombre (Σ des BL remis ;
> recopie exacte pour une commande à un BL complet). E6c2 fait **lire** ces
> colonnes. Argent, **irréversible à la première facture émise** sur elles :
> `vitruve`, puis déploiement **seul**, après le contrôle à zéro écart.

## 0. Le recensement (refait le 2026-10-25)

Recherche dans `apps/lfd-api/src/b2b/accounting/` (hors tests) des montants et
dates de commande (`totalCents`, `subtotalCents`, `vatCents`, `vatShares`,
`receivedOn`, `billableOrderWhere`, `billableSinceWhere`,
`FROZEN_INVOICE_ORDER_SELECT`) : **70 fichiers**. Parmi eux, **14 lisent la
table `orders`** ; les autres reçoivent les formes que ces 14 produisent
(`FrozenInvoiceOrder`, lignes de relevé, candidats au prélèvement) et ne
changent pas. Les cinq fichiers du domaine que la recherche remontait aussi
(`collection.events.ts`, `procedure-orders.reader.ts`, `monthly-invoicing.ts`,
`pending-order-cycle.ts`) ne la lisent pas : champs ou commentaires.

| Lecteur (`infrastructure/`)               | Lit aujourd'hui                                | Lira                                                                                                             |
| ----------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `billable-order-criterion.ts`             | `receivedOn` dans la fenêtre, `totalCents > 0` | `settled_on` dans la fenêtre, `totalCents > 0` **et** `billable_total_cents` posé                                |
| `cycle-order-membership.ts`               | `receivedOn`                                   | `settled_on`                                                                                                     |
| `frozen-invoice-order.mapper.ts`          | lignes et totaux de la commande                | lignes des **BL remis**, totaux `billable_*`                                                                     |
| `prisma-monthly-invoicing.reader.ts`      | la couture                                     | la couture (inchangé : elle bascule)                                                                             |
| `prisma-invoice-dossier.reader.ts`        | la couture                                     | idem                                                                                                             |
| `prisma-card-invoicing.reader.ts`         | la couture, `totalCents`, `receivedOn`         | la couture ; `billable_total_cents`, `settled_on`                                                                |
| `prisma-collection-candidates.reader.ts`  | la couture, `totalCents`                       | la couture ; `billable_total_cents` ; exclut les commandes non soldées                                           |
| `prisma-cycle-orders.reader.ts`           | totaux de la commande                          | `billable_*`                                                                                                     |
| `prisma-billable-orders.reader.ts`        | `_sum totalCents`                              | `_sum billable_total_cents`                                                                                      |
| `prisma-collection-batch.reader.ts`       | `totalCents`                                   | `billable_total_cents`                                                                                           |
| `prisma-order-collection.repository.ts`   | `totalCents` à la création de l'encaissement   | `billable_total_cents` ; jamais avant le solde                                                                   |
| `prisma-detached-unpaid.reader.ts`        | `totalCents`                                   | `billable_total_cents`                                                                                           |
| `prisma-procedure-orders.reader.ts`       | `totalCents`, `receivedOn`                     | `billable_total_cents`, `settled_on`                                                                             |
| `prisma-unconfirmed-deliveries.reader.ts` | `totalCents`, `receivedOn`                     | `billable_total_cents` ; une commande **remise mais non soldée** y reste visible, nommée « en attente du reste » |

## 1. Les règles

- **Une commande non soldée n'est ni facturée, ni relevée, ni prélevée** ; le
  bloqueur d'émission la **nomme** (`invoice-issuance-blockers.ts`), jamais en
  silence.
- **`totalCents > 0` reste** la garde des commandes gratuites `not_required` ;
  une commande au compte à BL valorisé 0 € est écartée **et nommée**.
- **Le contrôle de cohérence** garde la comparaison à `totalCents` pour une
  commande à un BL complet (recopie attendue), et recompose une commande
  partielle par la fabrique d'E6c1.
- **La ligne de référence** de la facture cite commandes et BL (§ 11 du plan
  E6) : « Commandes : ORD-1042 — Bons de livraison : BL-1042-1 ».
- **Le gel** : un déclencheur refuse toute réécriture d'un `billable_*` ou de
  `settled_on` posés (NOT NULL → autre, NOT NULL → NULL).

## 2. Pré-conditions de déploiement (runbook)

Le réconciliateur a posé `billable_*` et `settled_on` sur **toute** commande
remise et soldée ; le contrôle d'E6c1 rend **zéro écart** ; la requête du
runbook le vérifie en production avant la promotion.

## 3. Tests

Pour chaque lecteur du § 0 : un test qui prouve qu'il lit `billable_*` /
`settled_on` (une commande dont la valeur facturable diffère volontairement
du total commandé — un BL partiel — et le lecteur rend la valeur
facturable). E2E : facture du mois, facture carte, relevé, lot de
prélèvement, dossier, procédure, bons à constater — identiques au centime
avant et après sur le scénario de démonstration (commandes à un BL complet),
et justes sur une commande partielle.

## 4. Contradiction de `vitruve` (2026-10-25) — l'emporte sur les § 0 à § 3

_Décidé par l'assistant (Hugo : « tu finis l'intégralité des points »)._

**Recensement corrigé** : 22 fichiers de `accounting/infrastructure` touchent
`order`, pas 14. À classer au bâti, en plus de la table : sans montant,
`prisma-billing-statement.reader.ts` (numéros), `prisma-collection-orders.readers.ts`
(annulées), `prisma-order-engagement.reader.ts` (ne lit pas `orders`) ;
`ordersTotalCents` des relevés et des lots est **calculé en amont** par les
lecteurs qui basculent (relevé, candidats) — il suit ; `prisma-collection-batch.reader.ts`
lit `order_collection.amountCents`, pas `totalCents` ; hors `accounting`,
`prisma-order-refund-request.reader.ts` (`chargedCents = totalCents`) ne change
pas tant que la carte est exclue du départ incomplet (E6 § 7) ;
`refund-credit-note.ts` ventile depuis la facture et ne change pas ;
`invoice-order-consistency.ts` entre dans la table. « Mes factures » et
l'espace client : lus au bâti, classés.

**BLOQUANTS, résolus :**

1. **Le gel ne vaut qu'une fois la commande ENGAGÉE** — portée par une facture
   (`invoice_order`), un relevé (`billing_statement_order`) ou un encaissement
   qui n'est plus `due` (`order_collection`). Le déclencheur refuse alors toute
   réécriture d'un `billable_*` ou de `settled_on`, par `IS DISTINCT FROM`
   (jsonb et colonnes nullables). Avant l'engagement, le verdict `correct` du
   réconciliateur reste possible ; après, il est **compté** comme écart et
   jamais tenté.
2. Couvert par 1 : une commande prélevée sans facture est engagée.
3. **Bons à constater** : critère « remise, `settled_on` nul » au lieu de
   `receivedOn` nul ; une commande partiellement remise y reste, avec son total
   **commandé** et la mention « en attente du reste ».
4. **« `billable_total_cents` posé » s'ajoute à `billableOrderWhere` et à
   `billableSinceWhere` seulement**, jamais à `accountOrderWhere`, que les bons
   à constater et les bons à venir du cycle partagent.
5. **L'encaissement** : au solde, `Order.closeBilling` réaligne la ligne
   `order_collection` encore `due` sur `billable_total_cents` (même unité de
   travail) ; la révision est déjà refusée sur une commande décidée (E6b), donc
   `AccountOrderRevaluation.revalue` ne réécrit jamais un montant facturable.
   Contrôle avant promotion : toute ligne `due` vaut `billable_total_cents`.

**SÉRIEUX, résolus :**

- **La facture carte garde `totalCents`** : pas de départ incomplet par carte,
  et la facture carte part à la remise, avant tout solde (pas de course).
- **Pré-condition ajoutée au runbook** : pour toute commande à un BL complet,
  `settled_on = received_on` (sinon des commandes changeraient de mois).
- **Une facture émise sur un montant faux** se corrige par un **avoir** (le
  chemin existant des 381), jamais par une réécriture.
- La couture des lignes des BL remis : ordre par rang de BL puis identifiant de
  ligne ; une ligne livrée à 0 n'est pas facturée.

## 5. Ajouts (2026-10-25)

- **La décision au journal** (_décidé par l'assistant_) : E6b l'a bâtie
  `@sans-journal`, la table servant de trace. Une décision d'argent prise par
  une personne apparaît au journal d'activité : fait `order.shortfall_decided`
  (auteur, quantités partantes, reste), avec son libellé dans le back-office.
- `billable_voucher_discount_cents` existe (ajouté par le bâtisseur d'E6c1 :
  la recopie d'une commande à bon en a besoin pour s'additionner) ; la couture
  et le relevé le lisent.
