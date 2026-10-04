# Les événements durables — inventaire et refacto

> Hugo, 2026-10-04 : « maintenant qu'on a la boîte d'envoi, est-ce que ça doit
> changer la manière dont on journalise ? est-ce qu'il y a une refacto à
> faire ? » État : **inventaire fait, refacto non commencée**. Suite de
> [`plan-boite-d-envoi.md`](plan-boite-d-envoi.md).

## 1. Ce qui ne change pas : le journal

Le journal (`growth.activity_events`) et la boîte d'envoi (`platform.outbox`)
écrivent tous deux un fait dans la transaction du geste, mais ils ne font pas
le même travail :

|          | Journal                               | Boîte d'envoi                    |
| -------- | ------------------------------------- | -------------------------------- |
| Question | qui a fait quoi, quand ?              | qui doit encore réagir ?         |
| Lecteur  | un humain (écran Journal), le cockpit | le relais, puis les abonnés      |
| Durée    | pour toujours, opposable              | un message livré a fini son rôle |
| État     | aucun, le fait est figé               | un état de livraison par abonné  |

**On ne les fusionne pas.** Le journal n'a pas à porter d'état de livraison,
et la boîte d'envoi n'a pas à servir de trace.

## 2. Ce qui change : `publishTraced` ne couvre que la moitié

`publishTraced(event)` écrit le fait au journal **dans** la transaction, puis
le publie **en mémoire**. La trace est sûre, la livraison ne l'est pas. Un
événement qui doit faire réagir un autre bloc implémente donc **les deux**
contrats, `JournaledEvent.journalFact()` et `DurableEvent` : le même geste
écrit la ligne de journal et la ligne de la boîte d'envoi, dans la même
transaction. Le fait reste décrit une seule fois, dans une seule classe.

## 3. L'inventaire (relevé le 2026-10-04)

30 abonnés : 29 `@EventsHandler` et 1 `@DurableHandler`. L'idempotence est
celle que l'inventaire a lue dans le code ; seule celle des points de fidélité
a été rouverte (ligne 11).

**A — un effet (statut, argent, courriel) ou un autre bloc : à rendre durable**

| #   | Abonné                                     | Écoute                                    | Effet                                            | Si perdu                                |
| --- | ------------------------------------------ | ----------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| 30  | `orders/on-production-day-closed`          | `production.day_closed`                   | placed → confirmed                               | ✅ **durable** (BE3, 2026-10-04)        |
| 5   | `orders/on-order-packed`                   | `OrderPackedEvent` (production)           | placed → ready                                   | commande bloquée en `placed`            |
| 28  | `orders/on-order-handed-over`              | `OrderHandedOverEvent` (handover)         | ready → fulfilled                                | commande bloquée en `ready`             |
| 11  | `loyalty/credit-points-on-handover`        | `OrderHandedOverEvent`                    | **points de fidélité**                           | points jamais crédités                  |
| 10  | `loyalty/credit-points-on-payment-settled` | `OrderPaymentSettledEvent`                | **points de fidélité**                           | points jamais crédités                  |
| 1   | `delivery/hand-departed-orders-over`       | `DeliveryRoundDepartedEvent`              | la garde passe au livreur (port vers le retrait) | le retrait croit la commande au fournil |
| 2   | `delivery/announce-delivery-departure`     | `DeliveryRoundDepartedEvent`              | « partie » au commerce (port)                    | le commerce ignore le départ            |
| 25  | `orders/send-order-placed-mail`            | `OrderPlacedEvent`                        | courriel d'accusé                                | pas d'accusé                            |
| 26  | `orders/send-guest-order-notice`           | `OrderPlacedEvent`                        | courriel au propriétaire probable                | pas d'alerte                            |
| 27  | `orders/send-order-ready-mail`             | `OrderReadyEvent`                         | courriel « prête » + QR                          | le client ne sait pas                   |
| 24  | `orders/send-order-settled-mail`           | `OrderPaymentSettledEvent`                | courriel d'accusé carte                          | pas d'accusé                            |
| 9   | `orders/send-payment-failed-mail`          | `OrderPaymentFailedEvent` (refusée)       | courriel                                         | le client ignore le refus               |
| 4   | `orders/send-payment-expired-mail`         | `OrderPaymentFailedEvent` (journée close) | courriel                                         | le client ignore l'annulation           |
| 7   | `orders/ring-failed-pro-settlement`        | `OrderPaymentFailedEvent`                 | cloche staff                                     | le staff ignore un règlement tombé      |
| 6   | `orders/ring-refund-due`                   | `OrderPaidAfterCancellationEvent`         | cloche staff                                     | remboursement oublié                    |
| 13  | `account/send-login-method-linked-mail`    | `LoginMethodLinkedEvent`                  | alerte de sécurité                               | l'utilisateur n'est pas alerté          |
| 12  | `catalog/on-product-media-changed`         | `ProductMediaChangedEvent` (pim)          | projette l'image dans le catalogue               | image obsolète jusqu'au prochain envoi  |

Idempotence : les courriels et les cloches portent une clé déterministe
(`idempotencyKey`). Le crédit de points relit les gains déjà écrits pour la
commande, sous le verrou du titulaire (`prisma-loyalty-earned-orders.reader.ts`,
rouvert le 2026-10-04) ; que l'index partiel `(order_id) WHERE kind='earned'`
soit **unique** n'est pas vérifié, et doit l'être avant le lot E2.

**B — analytique (croissance, cockpit, alertes) : durable si sa perte fausse
une décision**

`growth/on-order-placed`, `on-order-ready`, `on-order-handed-over`,
`on-order-abandoned`, `on-user-registered`, `on-user-registered-link-lead`
(conversion d'un lead), `on-support-requested`, `on-support-handled`,
`on-subscription-created`, `on-company-step-reached`, `on-company-declared`,
`account/on-company-declared-resolve-naf`, `alerts/on-order-placed`. Tous
idempotents par clé.

**C — rafraîchissement dans le même bloc : reste en mémoire.** Aucun abonné
actuel n'en relève strictement : les deux candidats de l'inventaire (1, 2)
appellent un port vers un autre bloc, et sont donc en A.

**Homonymes.** Deux `OrderHandedOverEvent` coexistent : celui du retrait
(`handover/channels/commerce/`, qu'écoute #28) et celui du commerce
(`b2b/orders/domain/events/`, qu'écoutent #11 et #21). Durables, ils prendront
deux `type` distincts (`handover.handed_over`, `order.fulfilled`) : un même nom
pour deux faits ferait livrer l'un aux abonnés de l'autre.

## 4. Les lots

| Lot | Faits                                                        | Pourquoi dans cet ordre                                                  |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| E1  | `OrderPacked` → ready (#5)                                   | une perte bloque une commande, et le courriel « prête » (#27) suit       |
| E2  | Retrait (#28, #11, #21)                                      | statut **et argent** ; relevé d'unicité des points d'abord               |
| E3  | Départ d'une tournée (#1, #2)                                | la garde ; fait durable `delivery.round_departed`, les ports restent     |
| E4  | Paiement (#10, #24, #9, #4, #7, #6)                          | Stripe rejoue son webhook, mais pas le saut en mémoire qui suit l'accusé |
| E5  | Courriels de passation (#25, #26), alerte (#13), image (#12) | effets, pertes moins graves                                              |
| E6  | La croissance (B), en un lot                                 | le cockpit et le score des leads                                         |

## 5. La porte

`lint:durable-cross-block` : un `@EventsHandler` qui écoute un événement
déclaré dans **un autre bloc** (le chemin de la classe d'événement le dit)
échoue, sauf s'il figure sur une liste de dette qui ne peut que diminuer,
comptée et affichée à chaque passage, comme `lint:controller-buses`. Elle
naît avec E1, la liste pleine.
