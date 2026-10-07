# Les événements durables — inventaire et refacto

> Hugo, 2026-10-04 : « maintenant qu'on a la boîte d'envoi, est-ce que ça doit
> changer la manière dont on journalise ? est-ce qu'il y a une refacto à
> faire ? » État : **inventaire fait ; E1 bâti (§6), E2 bâti (§7), E3 bâti
> le 2026-10-06 par le lot DD1 de la livraison (§7 bis)** ; E4 à E6 restent.
> Suite de [`plan-boite-d-envoi.md`](plan-boite-d-envoi.md).

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
| 5   | `orders/on-order-packed`                   | `production.order_packed`                 | placed → ready                                   | ✅ **durable** (E1, 2026-10-04)         |
| 28  | `orders/on-order-handed-over`              | `handover.handed_over` (handover)         | ready → fulfilled                                | ✅ **durable** (E2, 2026-10-04)         |
| 11  | `loyalty/credit-points-on-handover`        | `order.fulfilled`                         | **points de fidélité**                           | ✅ **durable** (E2, 2026-10-04)         |
| 10  | `loyalty/credit-points-on-payment-settled` | `OrderPaymentSettledEvent`                | **points de fidélité**                           | points jamais crédités                  |
| 1   | `delivery/hand-departed-orders-over`       | `DeliveryRoundDepartedEvent`              | la garde passe au livreur (port vers le retrait) | ✅ **durable** (E3 par DD1, 2026-10-06) |
| 2   | `delivery/announce-delivery-departure`     | `DeliveryRoundDepartedEvent`              | « partie » au commerce (port)                    | ✅ **durable** (E3 par DD1, 2026-10-06) |
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
rouvert le 2026-10-04) ; l'index partiel `(order_id) WHERE kind='earned'` est
**unique** (`20260926160000_la_fidelite`, `loyalty_ledger_entries_earned_order_key`,
vérifié le 2026-10-04) : un second gain pour la même commande est refusé en
base. Le préalable d'E2 est levé.

**B — analytique (croissance, cockpit, alertes) : durable si sa perte fausse
une décision**

`growth/on-order-placed`, `on-order-ready`, `on-order-handed-over` (✅
**durable**, E2, 2026-10-04 — `order.fulfilled`),
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
| E3  | Départ d'une tournée (#1, #2)                                | la garde ; **bâti par DD1 le 2026-10-06** (§7 bis), ports retirés        |
| E4  | Paiement (#10, #24, #9, #4, #7, #6)                          | Stripe rejoue son webhook, mais pas le saut en mémoire qui suit l'accusé |
| E5  | Courriels de passation (#25, #26), alerte (#13), image (#12) | effets, pertes moins graves                                              |
| E6  | La croissance (B), en un lot                                 | le cockpit et le score des leads                                         |

## 5. La porte

`lint:durable-cross-block` : un `@EventsHandler` qui écoute un événement
déclaré dans **un autre bloc** (le chemin de la classe d'événement le dit)
échoue, sauf s'il figure sur une liste de dette qui ne peut que diminuer,
comptée et affichée à chaque passage, comme `lint:controller-buses`. Elle
naît avec E1, la liste pleine.

## 6. E1 bâti (2026-10-04) — le colisage

- `PackOrderHandler` écrit `markPacked` et `production.order_packed` dans **une**
  unité de travail ; le fait n'est écrit que si le poste **gagne** l'écriture
  conditionnée. Le perdant d'une course n'écrit rien. Plus rien ne part en
  mémoire pour ce fait.
- **Le contrat** : `{ orderId, reference, packedAt, packedBy }`, relu par
  `OrderPackedEvent.fromPayload`. **La clé** : `production.order_packed:<orderId>`.
- **Le rescan est un fait neuf par geste** (`…:reannounced:<instant>`), comme la
  réannonce de la clôture, et contre la consigne du §7 de la boîte d'envoi (« les
  réannonces restent en `publish` ») : le rescan est un filet humain que l'e2e
  `production-batch` « RATTRAPE un commerce resté en arrière » tient, et c'est le
  seul pour un bac colisé avant ce lot, dont le fait en mémoire perdu n'a aucune
  ligne à rejouer. Dédupliqué par la clé, il ne livrerait rien.
- L'abonné `OnOrderPacked` est un `@DurableHandler`
  (`b2b.orders.mark-ready`).
- **L'idempotence n'était pas vraie, elle l'est.** `MarkOrderReadyCommand` levait
  `PackingRefusedError` sur une commande déjà prête : un rescan échouait (en
  silence en mémoire, en message mort sous la boîte d'envoi). Elle rend
  désormais un succès sans effet, course perdue comprise. Annulée, brouillon ou
  retirée restent des refus — un message mort visible, pas une divergence muette.
- **`OrderReadyEvent` part après la validation** (`AfterCommit`). Publié dans
  l'unité de travail de la livraison, l'abonné du journal en héritait la
  transaction et écrivait `order.ready` sur une transaction close — `record`
  l'avalait (trois e2e `production-batch` rouges).
- **#27 (courriel « prête ») et #19 (journal `order.ready`) restent en mémoire** :
  `OrderReadyEvent` est déclaré et écouté dans le bloc `b2b`, la porte ne les
  vise pas. Ils sont désormais déclenchés après la validation d'une livraison
  durable ; leur perte ne survient plus qu'entre la validation et le saut en
  mémoire (redémarrage à cet instant). Les rendre durables demanderait que
  `MarkOrderReadyHandler` écrive un fait `order.ready` dans la même unité de
  travail — c'est E5/E6, pas E1.
- **La porte** `lint:durable-cross-block` est née : dette de deux abonnés
  (`on-order-handed-over` → E2, `on-product-media-changed` → E5).

## 7. E2 bâti (2026-10-04) — le retrait

- **Trois émetteurs, un seul chemin.** Le scan et la saisie au comptoir
  (`ConfirmHandoverHandler`, `ConfirmManualHandoverHandler`) et la remise à la
  porte (`HandoverDoorstepAttestor`, attestation et rejeu) passent tous par
  `HandoverAttestation`, qui écrit l'attestation et `handover.handed_over` dans
  **une** unité de travail — la sienne au comptoir, celle du livreur à la porte.
  Le perdant d'une course lève dans l'unité : rien n'est écrit. Plus rien ne
  part en mémoire pour ce fait.
- **Le contrat** : `{ orderId, reference, handedOverAt, handedOverBy, via }`,
  relu par `OrderHandedOverEvent.fromPayload` (canal du retrait). **La clé** :
  `handover.handed_over:<orderId>`.
- **La réannonce reste, en fait neuf** (`…:reannounced:<instant>`), comme le
  rescan du colisage : un retrait refusé au comptoir réannonce l'attestation
  existante (relue après l'annulation, donc celle du gagnant d'une course), et
  le rejeu d'un arrêt à la porte aussi. C'est le seul filet pour un retrait
  attesté avant ce lot, dont le fait en mémoire perdu n'a aucune ligne à rejouer.
- **Deux types, et le commerce écrit le sien.** `MarkOrderFulfilledHandler` écrit
  `markFulfilled` et `order.fulfilled` dans une unité de travail (celle de la
  livraison durable quand l'abonné l'appelle). Pourquoi un second fait plutôt
  que de brancher les points et le journal sur `handover.handed_over` : le
  retrait ne connaît ni le client ni l'identifiant qu'ils lisent, et il annonce
  un fait par GESTE (réannonces comprises) — `order.fulfilled` n'est écrit que
  par l'écriture gagnante de `markFulfilled`, un par commande
  (`order.fulfilled:<orderId>`). Les deux classes s'appellent encore
  `OrderHandedOverEvent` ; leurs types ne le peuvent pas (§3).
- **Les abonnés** : `b2b.orders.mark-fulfilled` (#28, `handover.handed_over`),
  `b2b.loyalty.credit-on-handover` (#11) et `b2b.growth.record-handed-over`
  (#21), tous deux sur `order.fulfilled`.
- **L'idempotence, relue** : `MarkOrderFulfilledCommand` était déjà un succès
  sans effet sur une commande retirée (`handedOverAt: null` dans le `where`) ;
  elle n'écrit pas de second `order.fulfilled`. `CreditOrderPointsCommand`
  relit les gains sous le verrou du titulaire, et l'index unique refuse le
  reste. Aucun test « qui échouait avant » : les deux tenaient déjà ; les e2e
  `handover-durable` (abonné repris, double attestation, course) le prouvent.
- **Plus rien en mémoire à hériter de la transaction du relais** :
  `MarkOrderFulfilledHandler` ne publie plus sur le bus (le piège d'E1 ne se
  pose pas).
- **La porte** `lint:durable-cross-block` : `on-order-handed-over` sort de la
  dette ; reste `on-product-media-changed` (E5).
- ⚠️ **Le port de la livraison rend encore une publication**
  (`HandoverPublication`, `DoorstepHandoverAttestor`) : elle est désormais vide,
  le fait étant écrit dans l'unité du livreur. La retirer touche le canal de la
  livraison et ses appelants — laissé à une tranche à part.

## 7 bis. E3 bâti (2026-10-06) — le départ et le retour d'une tournée

Bâti par la livraison en un seul lot, DD1 (`375f82225`) ; l'état est décrit
dans [`../livraisons/en-route.md`](../livraisons/en-route.md) et
[`../livraisons/a-la-porte.md`](../livraisons/a-la-porte.md) § 5.

- **Deux faits durables**, déclarés par la livraison dans son canal vers le
  retrait (`delivery/channels/handover/`) et écrits dans la transaction du
  geste : `delivery.round_departed` (`DeliveryRoundDepartedFact`) au départ,
  `delivery.orders_brought_back` (`DeliveryOrdersBroughtBackFact`) au retour.
- **Trois abonnés `@DurableHandler`** : `handover.record-round-departed` (la
  garde passe au livreur), `handover.record-orders-brought-back` (la garde
  rentre au dépôt) et `b2b.mail-delivery-en-route` (le courriel « en route »,
  qu'envoyait l'annonce au commerce).
- **Les ports ne restent pas**, contre ce que prévoyait le §4 : les abonnés en
  mémoire #1 et #2 et les trois ports d'annonce (`DeliveryDepartureAnnouncer`,
  `DepartedOrdersAnnouncer`, `BroughtBackOrdersAnnouncer`) sont supprimés.
- `order_departure` devient monotone par instant : un départ rejoué après un
  retour ne remet plus la commande « partie », et un retour livré avant son
  départ est gardé (`departed_at` nullable, migration
  `20261007180000_le_retour_avant_le_depart`).
- **La porte** `lint:durable-cross-block` : la dette passe de quatre abonnés à
  deux — `on-product-media-changed` (E5) et `tell-delivery-order-placed` (la
  commande passée vers la livraison, à basculer).

## 8. Les ports entre blocs — inventaire (2026-10-04)

> Hugo : « si on a commencé les messages, est-ce que ce n'est pas mieux que
> les ports ? » La règle retenue : **dire par message, demander par port**.
> Un port n'est légitime que là où l'appelant a besoin de la réponse pour
> continuer, ou de l'état vif ; une annonce qui passe par un port est un
> message déguisé.

Relevé par un agent `Explore`, puis rouvert à la main pour ce qui est marqué
✔ (le reste est à revérifier avant d'agir) : **37 ports** déclarés dans des
`*/channels/*/`.

| Classe                                            | Compte | Ports                                                                                                                                                                                                                                                                                                                   | Suite                                                                               |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Annonce** — l'appelant n'utilise pas la réponse | 3      | `DeliveryDepartureAnnouncer` ✔ (livraison → commerce), `DepartedOrdersAnnouncer`, `BroughtBackOrdersAnnouncer` (livraison → retrait), appelés après validation sous `BackgroundWork` : perdables                                                                                                                        | **E3, fait le 2026-10-06** (§ 7 bis) : les trois ports sont **retirés**, pas gardés |
| **Décision de transition**                        | 1      | `PackingStation` (K2 : le poste passe par le fournil puis par ce port)                                                                                                                                                                                                                                                  | **K3** : le poste appelle directement les routes du colisage                        |
| **Décision légitime**                             | 4      | `PendingSettlementSweeper` ✔ (appelé par la clôture **avant** de charger la journée, l. 113 : la clôture a besoin que les règlements en vol soient tranchés), `DoorstepHandoverAttestor` (la porte attend la réponse), `B2bCatalogDriver` (envoi du catalogue, déjà asynchrone et journalisé), et un autre à identifier | rester des ports                                                                    |
| **Lecture**                                       | 29     | dont 13 implémentés par le commerce (commandes, adresses, échéances, catalogue)                                                                                                                                                                                                                                         | rester des ports : l'état vif appartient au commerce                                |

**Lectures qui figent une copie** (`DayOrdersReader` à la clôture,
`DeliveryOrdersReader` au départ d'une tournée) : elles lisent l'état vif au
moment d'un geste, puis le geste fige un instantané chez l'appelant. C'est
la bonne forme — une copie tenue à jour par messages coûterait sa
synchronisation sans rien ajouter.

**À revérifier avant d'agir** (affirmations de l'agent, non rouvertes) :

- `MediaCarriers` agrège trois porteurs ; un seul en échec refuserait le
  retrait d'une image ;
- des lectures servies à chaque écran sans pagination
  (`DeliveryOrdersReader`).
