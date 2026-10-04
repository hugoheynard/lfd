# Le colisage, son propre domaine — plan

> Hugo, 2026-10-04 : « sortir de production, j'ai l'impression que ça mérite son
> propre domaine ». État : **doc-first**, rien de bâti. À contredire par
> `vitruve` (migration de données, frontière) avant de bâtir.

## 1. Ce qui existe (relu le 2026-10-04)

Le colisage est aujourd'hui **coupé en deux et logé chez deux autres** :

| Morceau                                                             | Où                                                                                 | Écrivain                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Ligne « au bac » (`packed_at/by/initials`)                          | `production.production_order_line`                                                 | `ProductionDay` (`production-day.packing.ts`, gardes) |
| Bac fermé, nombre de contenants (`packed_at/by`, `container_count`) | `production.production_order`                                                      | `ProductionDay.pack` / `declareContainers`            |
| Annonce « prête » au commerce                                       | `OrderPackedEvent` (`production/channels/commerce`) → `on-order-packed.handler.ts` | production                                            |
| Bacs déclarés, code court, demi-bacs                                | `delivery.delivery_bin`                                                            | livraison                                             |
| Colisage proposé                                                    | `delivery/domain/services/propose-packing.ts`                                      | livraison                                             |
| Écran                                                               | `/production/colisage` (rail Production), droit `production_packing`               | —                                                     |

Le commentaire de `production-day.packing.ts` dit **pourquoi ce n'est pas deux
agrégats** : une ligne ne se met au bac que si elle est **sortie du four**
(`LineNotProducedYetError`, via `availableOf` des fournées) et seulement
journée **arrêtée** (`ProductionDayNotClosedError`). C'est la vraie couture.

## 2. Pourquoi un domaine

- **Sa clé est la commande et le bac**, pas la journée — le motif exact qui a
  sorti `handover` du fournil le 2026-09-10.
- **Un poste, une personne, un rythme** : le coliseur, sa tablette, son QR.
- **Il est déjà à cheval** : le remplissage chez le fournil, les bacs chez la
  livraison. Le domaine réunit ce que la découpe actuelle sépare.

## 3. La forme proposée

- Bloc **`src/packing/`**, schéma Postgres **`packing`**, routes `/packing`,
  rail de premier niveau « Colisage » (l'adresse `/production/colisage`
  redirige ; les QR `/colisage/:reference` déjà imprimés continuent).
- Agrégat **`PackingOrder`** (clé : `orderId` opaque) : lignes au bac
  (réversibles), fermeture (irréversible), contenants.
- **Ce qu'il demande, par canaux qu'il déclare** :
  - `packing/channels/production/` — « ces commandes sont-elles au plan d'une
    journée arrêtée, et combien de chaque SKU est sorti ? » (implémenté par
    `production`) ;
  - `packing/channels/commerce/` — l'annonce « prête » (implémentée par `b2b`,
    qui écoute aujourd'hui `OrderPackedEvent`).
- **Les bacs restent en livraison** pour ce plan : `delivery_bin` est écrit par
  le chargement et porte les déclencheurs de journée de « Ma tournée ». Les
  déplacer est une seconde décision (Q2).

Matrice : `packing → production` port uniquement ; `packing → b2b` port
uniquement ; `delivery → packing` port uniquement si la livraison lit « fermé »
(Q3). Personne ne lit `packing` autrement.

## 4. Les données — trois déploiements (étendre, basculer, resserrer)

Les colonnes sont **sur** des tables du fournil : pas de `SET SCHEMA` possible
comme pour `delivery` (`plan-schema-delivery.md`). Donc copie :

1. **Étendre** — migration additive : `packing.packing_order`,
   `packing.packing_line`, remplies par `INSERT … SELECT` depuis
   `production_order(_line)` ; le fournil continue d'écrire, et
   **écrit aussi** dans les nouvelles (double écriture dans l'adaptateur).
2. **Basculer** — le bloc `packing` devient l'écrivain et le lecteur ; le
   fournil ne lit plus ses colonnes de colisage.
3. **Resserrer** — plus tard, après une requête de comptage donnée à Hugo :
   les colonnes `packed_*` / `container_count` du fournil cessent d'être lues
   (on ne les supprime pas avant un quatrième passage).

Aucune migration n'accorde de droit : `production_packing` reste la ressource
(renommage = migration de valeur, trois temps — pas dans ce plan).

## 5. Questions pour Hugo

- **Q1** : garder la règle « on ne colise que ce qui est sorti du four, journée
  arrêtée » ? (Proposé : oui, lue par le canal production.)
- **Q2** : les bacs (`delivery_bin`) rejoignent-ils le colisage maintenant, ou
  plus tard ? (Proposé : plus tard.)
- **Q3** : la livraison a-t-elle besoin de savoir qu'une commande est fermée
  avant « Partir » ? (À relever dans le code.)

## 6. Lots

| Lot | Contenu                                                           | Migration |
| --- | ----------------------------------------------------------------- | --------- |
| P0  | Rail : Colisage au premier niveau, redirection                    | non       |
| P1  | Bloc `packing`, canaux, agrégat, tables + copie + double écriture | additive  |
| P2  | Bascule de l'écrivain et des lectures                             | non       |
| P3  | Resserrement                                                      | plus tard |

## 7. Contradiction de `vitruve` (2026-10-04)

**BLOQUANTS** — à lever avant P1 :

1. **Double écriture sans mécanisme.** Les écritures actuelles sont des
   `updateMany` conditionnés isolés (`prisma-production-day.repository.ts`),
   et `PackOrderHandler` tranche la course entre deux postes sur leur `count`.
   Une seule base : une `$transaction` sur les deux schémas est possible, et
   l'écriture côté `packing` doit être conditionnée de la même façon.
2. **Fenêtre de déploiement.** L'`INSERT…SELECT` de la migration précède le
   code qui double-écrit : il faut un rattrapage idempotent et une comparaison
   avant P2, décoche comprise.
3. **`day_change`.** Les déclencheurs par instruction sur `production_order(_line)`
   (`20260928140000`) font monter la version du jour à chaque coche ; des tables
   `packing.*` sans `service_day` ne le feraient plus, et
   `day-change-triggers.e2e-spec.ts` ne regarde que `production` et `delivery`.

**SÉRIEUX** :

- **La motivation est fragile.** Contrairement à `handover`, le colisage
  garde deux règles en forme de JOUR (journée arrêtée, quantité sortie du
  four). Sorti, chaque geste devient « vérifier par le canal, puis écrire
  ailleurs », sans verrou — la couture que `production-day.packing.ts` donne
  comme raison d'un seul agrégat.
- **Q3 répondue** : la livraison lit « colisée » par le COMMERCE
  (`OrderStatus.ready`, via `OnOrderPacked`) ; « Partir » bloque sur
  l'étiquetage et le chargement des bacs, pas sur `ready`. Aucune arête
  `delivery → packing`. La chaîne `OrderPackedEvent → ready` doit survivre,
  et b2b l'importe depuis `production/channels/commerce`.
- Routes API déjà servies (`production-packing.controller.ts`,
  `production-supervision.controller.ts`) : à garder. Portes à armer :
  `context-boundaries`, datasource, `prisma-schema-layout`,
  `prisma-model-ownership`, §1 de CLAUDE.md. Irréversible après P2.

**Proposition après contradiction** : bâtir **P0 seul** (le Colisage au
premier niveau du rail ; le QR `/colisage/:reference` l'est déjà). Ne lancer
P1 que si le colisage gagne une règle qui n'est pas en forme de jour —
typiquement si les bacs le rejoignent (Q2) avec la capacité (CA4).

## 8. Pousser plutôt que tirer (Hugo, 2026-10-04)

> « quand tu dis ce qu'il demande, c'est du pull, on ne ferait pas mieux
> d'être push ? »

Oui, et ça répond à l'objection principale du §7. Au lieu que chaque geste
demande au fournil « journée arrêtée ? combien de sorti ? », le fournil
**publie** ses faits et le colisage en tient **sa propre copie** :

- `ProductionDayClosed { serviceDay, commandes et lignes au plan }` ;
- `BatchOutput { serviceDay, sku, quantité sortie }` (et sa correction) ;
- le colisage publie à son tour `OrderPacked`, que le commerce écoute déjà.

La garde lit alors **l'état local** de l'agrégat `PackingOrder`, dans la même
transaction que l'écriture : plus de « vérifier ailleurs, écrire ici ». C'est
la forme de `handover`, qui reçoit la commande au lieu d'aller la lire.

Ce que ça coûte, à trancher avant P1 :

- **Retard de projection** : une fournée tout juste sortie peut être refusée
  une seconde — le geste se rejoue. Acceptable au poste.
- **Fiabilité de la publication** : un événement perdu = une commande jamais
  colisable. Il faut une publication sûre (écrite dans la transaction du
  fournil, puis relayée — boîte d'envoi), pas un `EventBus` en mémoire seul.
  À relever : ce que le dépôt a déjà (le journal ?) avant d'inventer.
- **Rattrapage** : la projection doit pouvoir se reconstruire depuis le
  fournil (au déploiement de P1 et après incident) — ce qui règle aussi le
  BLOQUANT 2 du §7 (fenêtre de déploiement) mieux qu'une double écriture.
- **`day_change`** (BLOQUANT 3) reste à résoudre : la projection garde le
  `service_day`, donc les déclencheurs peuvent l'inscrire.

Avec le push, la **double écriture disparaît** (BLOQUANT 1) : le fournil
n'écrit plus le colisage du tout dès P1 ; il publie, et la bascule se fait
par reconstruction de la projection.
