# Ports et messages entre blocs — l'inventaire

> **Référence, relevée le 2026-10-04** (après le déploiement de K2 et E2,
> `100824362`). Les abonnés durables ont été relus dans le code ce jour-là ;
> le compte des ports vient d'un relevé `Explore`, et ce qui n'a pas été
> rouvert à la main est marqué « à revérifier ». Les décisions et l'ordre des
> lots vivent dans [`plan-evenements-durables.md`](plan-evenements-durables.md)
> et [`plan-boite-d-envoi.md`](plan-boite-d-envoi.md).

## 1. La règle

**Dire par message, demander par port.**

|                     | Message (fait durable)                | Port (appel direct)                       |
| ------------------- | ------------------------------------- | ----------------------------------------- |
| Il dit              | « ça s'est passé »                    | « dis-moi » ou « fais-le et réponds-moi » |
| L'émetteur          | n'attend rien, ne sait pas qui écoute | attend la réponse pour continuer          |
| L'autre est absent  | le message attend, puis il est livré  | l'appel échoue tout de suite              |
| Contrat déclaré par | le canal de l'émetteur                | le canal de celui qui demande             |

Un port qui annonce un fait sans utiliser la réponse est un **message
déguisé** : il se perd au premier redémarrage. Une lecture au moment d'un
geste, suivie d'un instantané chez l'appelant, est la bonne forme : une copie
tenue à jour par messages coûterait sa synchronisation sans rien ajouter.

## 2. Les messages durables (boîte d'envoi)

Mécanisme : [`plan-boite-d-envoi.md`](plan-boite-d-envoi.md). Le fait s'écrit
dans la transaction du geste (`DurablePublisher`) ; le relais le livre à
chaque abonné (`@DurableHandler`), au moins une fois ; l'abonné l'applique une
seule fois ; après dix essais, il est mort, nommé et rejouable
(`POST /admin/outbox/replay`).

| Fait                            | Écrit par, dans la transaction de                 | Abonné (nom stable)                                                              | Effet                                                        |
| ------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `production.day_closed`         | la clôture ; la réannonce                         | commerce — `ON_PRODUCTION_DAY_CLOSED`                                            | les commandes du plan arrêté passent confirmées              |
| `production.packing_list_drawn` | la clôture ; le retirage ; la réannonce           | colisage — `ON_PACKING_LIST_DRAWN`                                               | la liste à coliser, avec les échéances                       |
| `production.handed_to_packing`  | la déclaration d'une fournée                      | colisage — `ON_HANDED_TO_PACKING`                                                | le stock reçu par SKU                                        |
| `production.return_requested`   | l'annulation d'une fournée remise                 | colisage — `ON_RETURN_REQUESTED`                                                 | le colisage tranche le retour                                |
| `packing.returned`              | le colisage                                       | fournil — `ON_PACKING_RETURNED`                                                  | « sorti » baisse de ce qui est rendu                         |
| `packing.order_packed`          | la fermeture d'une commande au colisage           | commerce — `ON_PACKING_ORDER_PACKED`                                             | la commande passe prête                                      |
| `production.order_packed`       | le poste du fournil (journées `legacy` seulement) | commerce — `ON_ORDER_PACKED`                                                     | la commande passe prête                                      |
| `handover.handed_over`          | l'attestation de retrait (comptoir, porte)        | commerce — `ON_ORDER_HANDED_OVER`                                                | la commande passe remise                                     |
| `order.fulfilled`               | le commerce, une fois par commande                | fidélité — `CREDIT_POINTS_ON_HANDOVER` ; croissance — `RECORD_ORDER_HANDED_OVER` | les points (index unique par commande) ; la ligne de journal |

Neuf faits, dix abonnés. Seul le fournil ne s'écoute pas lui-même : à la
clôture, il fige son plan dans sa propre transaction.

**Arête ouverte, sans abonné encore** : `production/channels/delivery/`
publie `production.day_closed` pour la livraison (2026-10-04, option B ;
CA6 révisé, `livraisons/tournees/composition-automatique.md` §2.2).

## 3. Les messages encore en mémoire

Perdables si le processus redémarre entre l'écriture et l'abonné.
`lint:durable-cross-block` refuse un nouvel abonné en mémoire d'un fait d'un
**autre** bloc ; sa liste de dette n'en compte plus qu'un.

| Ce qui reste                                                                                                            | Lot     |
| ----------------------------------------------------------------------------------------------------------------------- | ------- |
| Le départ d'une tournée (vers le retrait et le commerce), les commandes rapportées                                      | E3      |
| Les règlements Stripe : points au paiement, accusé carte, courriels de refus et d'expiration, cloches staff             | E4      |
| Les courriels de passation, l'alerte de sécurité, l'image produit (`on-product-media-changed`, seul inscrit à la porte) | E5      |
| Le courriel « prête » et `order.ready` au journal (même bloc, après validation)                                         | E5 / E6 |
| La croissance : inscriptions, leads, étapes, support, abonnements                                                       | E6      |

## 4. Les ports

37 ports déclarés dans des `*/channels/*/`.

| Nature                        | Compte | Ports                                                                                                                                                                                                                                                           | Suite                                                 |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Annonce** (message déguisé) | 3      | `DeliveryDepartureAnnouncer` (livraison → commerce), `DepartedOrdersAnnouncer`, `BroughtBackOrdersAnnouncer` (livraison → retrait) — appelés après validation, sous `BackgroundWork`                                                                            | **E3** : des faits durables                           |
| **Décision de transition**    | 1      | `PackingStation` : en K2, le poste passe par le fournil puis par ce port                                                                                                                                                                                        | **K3** : le poste appelle le colisage directement     |
| **Décision légitime**         | 4      | `PendingSettlementSweeper` (la clôture doit trancher les règlements en vol avant d'arrêter le plan) ; `DoorstepHandoverAttestor` (la porte attend la réponse) ; `B2bCatalogDriver` (l'envoi du catalogue, asynchrone et journalisé) ; un quatrième à identifier | restent des ports                                     |
| **Lecture**                   | 29     | dont 13 répondues par le commerce : commandes, lignes, adresses, échéances, catalogue, procédures                                                                                                                                                               | restent des ports : l'état vif appartient au commerce |

**Les deux sens d'un même couple** : `pim ↔ media` (chacun déclare ce qu'il
demande à l'autre) et `delivery ↔ handover` (la garde au départ et à la
porte). Tous les autres ports vont dans un seul sens.

**Lectures qui figent un instantané** : `DayOrdersReader` à la clôture,
`DeliveryOrdersReader` au départ d'une tournée. Elles lisent l'état vif
au moment du geste, et le geste fige la copie chez l'appelant.

## 5. À revérifier avant d'agir

Affirmations du relevé `Explore` qui n'ont pas été rouvertes à la main :

- `MediaCarriers` agrège trois porteurs (référentiel, vitrine, opérations) ;
  un seul en échec refuserait le retrait d'une image ;
- des lectures de la livraison seraient servies à chaque écran sans
  pagination (`DeliveryOrdersReader`) ;
- le quatrième port de décision.
