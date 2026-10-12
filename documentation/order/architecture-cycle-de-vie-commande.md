# Le cycle de vie d'une commande — états, transitions, et qui les écrit

**État : 🟡 partiellement livré — relu contre le code le 2026-09-17, puis
corrigé le 2026-10-12** (colisage, droits des routes, boutique ouverte, QR du
bon, écrivains de `cancelled` ; les passages touchés portent « vérifié le
2026-10-12 »). Quatre
états s'écrivent réellement (`placed`, `confirmed`, `ready`, `fulfilled`) ; trois
existent dans l'énuméré sans qu'aucun chemin ne les écrive (`draft`,
`in_production`, `cancelled`) ; un reste à créer (`in_delivery`). Les §1 à §5
décrivent le code, le §6 la cible encore doc-first.

> ⚠️ **Corrigé le 2026-09-26** : `cancelled` **s'écrit** désormais, par deux
> chemins et sur une seule origine — une commande `placed` dont le règlement
> par carte n'est pas encaissé. L'**abandon** du client (`POST
/orders/:id/abandon`, particulier seulement) et le **balayage de la
> clôture** (toutes clientèles). Décrit dans [`architecture-abandon-du-reglement.md`](architecture-abandon-du-reglement.md). Seuls `draft` et
> `in_production` restent sans chemin. Les phrases ci-dessous que ce fait
> contredit portent chacune leur correction ; le reste n'a pas été relu.

**Portée** : l'axe **fabrication** (`status`). Le règlement (`paymentStatus`)
est un axe indépendant, décrit dans
[`architecture-reglement-et-compte-de-production.md`](architecture-reglement-et-compte-de-production.md) ;
le contenu de chaque colonne, dans
[`architecture-ce-que-porte-la-commande.md`](architecture-ce-que-porte-la-commande.md).

> ⚠️ **Ce document a été réécrit le 2026-09-17**, et ce n'est pas un
> rafraîchissement. La version du 2026-09-07 décrivait un monde où le commerce
> hébergeait le colisage et la remise ; ils vivent depuis dans les blocs
> `production/` et `handover/`, qui **annoncent** un fait que le commerce
> recopie. Elle disait aussi que le courriel « votre commande est prête » et le
> témoin `order.handed_over` n'existaient pas — les deux existent. Ses décisions
> de conception sont conservées au §7.

---

## 1. Ce qui s'écrit vraiment

```mermaid
stateDiagram-v2
    [*] --> placed: passation
    placed --> confirmed: arrêt de la journée
    placed --> ready: colisage
    confirmed --> ready: colisage
    placed --> fulfilled: retrait
    confirmed --> fulfilled: retrait
    ready --> fulfilled: retrait
    fulfilled --> [*]

    note right of placed
        draft · in_production · cancelled
        sont dans l'énuméré
        et AUCUN chemin ne les écrit
    end note
```

> ⚠️ **Corrigé le 2026-09-26** : il manque au diagramme `placed → cancelled`
> (abandon d'un particulier, ou clôture), réservé à un règlement non encaissé.
> La note ne vaut plus que pour `draft` et `in_production`.

**Pourquoi autant de flèches.** Le colisage et le retrait sont **volontairement
permissifs sur l'avancement** : ils acceptent tout état sauf `draft`,
`cancelled` et, pour le colisage, `fulfilled`. Exiger `in_production` fermerait
la porte pour de bon — rien n'y mène — et refuser un client physiquement là,
colis prêt, parce qu'un écran n'a pas été cliqué, ferait primer la machine sur
le monde réel (`packingBlocker`, `handoverBlocker`).

Deux conséquences qu'on lit dans ce schéma :

- une commande passée **après** l'arrêt de sa journée n'est dans aucun plan, ne
  sera jamais `confirmed`, et reste pourtant colisable et remettable ;
- un retrait **avant** le colisage est possible, et ferme le colisage ensuite
  (« Cette commande a déjà été retirée »).

## 2. Qui écrit chaque transition

**Le commerce n'écrit plus aucune transition de lui-même après la
passation.** Il réagit à un fait que le fournil ou le comptoir publie,
et passe par sa propre commande applicative, qui garde la règle, arbitre la
course et publie à son tour.

```mermaid
sequenceDiagram
    autonumber
    actor E as Équipe
    participant PR as production/
    participant PK as packing/
    participant HO as handover/
    participant CO as b2b/orders
    participant J as Journal + courriels

    E->>PR: POST /admin/production/batch/:date/close
    PR-->>CO: ProductionDayClosedEvent
    CO->>CO: absorbIntoPlan — placed → confirmed<br/>(seulement ce que planWhere accepte)

    E->>PK: POST /admin/packing/:date/orders/:orderId/close
    PK-->>CO: packing.order_packed (durable)
    CO->>CO: OnPackingOrderPacked → MarkOrderReadyCommand<br/>packingBlocker → ready + readyAt + readyBy
    CO-->>J: OrderReadyEvent → 📓 order.ready + 📧 « prête »

    E->>HO: POST /admin/handover/:token (scan)<br/>ou /admin/handover/manual/:reference
    HO->>HO: attestation dans production.order_handover
    HO-->>CO: OrderHandedOverEvent (handover/channels/commerce)
    CO->>CO: MarkOrderFulfilledCommand<br/>→ fulfilled + handedOverAt/By/Via (copie)
    CO-->>J: OrderHandedOverEvent → 📓 order.handed_over
```

| Transition    | Geste                                     | Route                                                                    | Qui détient le fait                      | Écriture côté commande                       | Condition en base            |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------- | ---------------------------- |
| → `placed`    | le client, l'équipe, ou un visiteur       | `POST /orders` · `POST /admin/orders` · `POST /shop/orders`              | le commerce                              | `PrismaOrderRepository.place()`              | création                     |
| → `confirmed` | **arrêter la journée**                    | `POST /admin/production/batch/:date/close`                               | le fournil (`production_day`)            | `absorbIntoPlan` via `OnProductionDayClosed` | `planWhere()`                |
| → `ready`     | **coliser** (clore la commande au poste)  | `POST /admin/packing/:date/orders/:orderId/close`                        | le colisage (`packing/`)                 | `markReady` via `OnPackingOrderPacked`       | pas annulée/brouillon/remise |
| → `fulfilled` | **remettre** (scan du code, ou à la main) | `POST /admin/handover/:token` · `POST /admin/handover/manual/:reference` | le retrait (`production.order_handover`) | `markFulfilled` via `OnOrderHandedOver`      | `handedOverAt IS NULL`       |

- **Les droits ne sont pas tous `b2b_orders`** (corrigé le 2026-10-12) : l'arrêt
  de la journée est `production_plan` (`production-day.controller.ts`), le
  colisage `production_packing` (`packing-orders.controller.ts`), le retrait
  `handover_counter` (`handover.controller.ts`). Le retrait répond aussi sous
  l'ancien préfixe `admin/production/handover`, pour ne casser aucun écran.
- **`POST /shop/orders` est ouverte depuis le 2026-10-11** (Hugo : le visiteur
  paie le prix et la TVA d'un particulier connecté ;
  `shop-orders.controller.ts`, `orders.module.ts`). Les passations client
  peuvent encore être refusées par l'ouverture par clientèle
  ([`ouverture-de-la-boutique.md`](ouverture-de-la-boutique.md)).
  Ancienne version : « fermée tant que l'ouverture n'est pas décidée ».
- 🔴 **L'arrêt de la journée n'absorbe pas toutes les `placed`**. Il écarte les
  règlements refusés et le visiteur dont la carte est encore en vol : c'est la
  règle du compte de production, pas celle de l'énuméré.
- **L'arrêt est rejouable, et c'est le rattrapage prévu.** Une seconde clôture
  ne recalcule rien côté fournil mais republie le fait ; le commerce ne trouve
  plus de `placed` absorbable et n'écrit rien. La réponse dit laquelle des deux
  choses vient d'arriver (`alreadyClosed`), et `GET …/batch/:date/status`
  expose les commandes restées en retard (`pendingInCommerce`).
- ⚠️ **Le bus vit en processus** pour la clôture du fournil. Si l'abonné du
  commerce échoue, le fournil a basculé et la commande non. C'est ce que
  `pendingInCommerce` rend visible. Le colisage, lui, passe par le bus durable
  (`@DurableHandler`).

## 3. Ce que chaque étape produit

```mermaid
flowchart LR
  P["**placed**"] --> C["**confirmed**"]
  C --> R["**ready**"]
  P --> R
  R --> F["**fulfilled**"]

  P -.-> Pm["📧 accusé de réception + QR<br/>dès la passation si rien à payer,<br/>sinon au paiement confirmé"]
  P -.-> Pf["📧 « paiement non passé »<br/>si Stripe refuse — sans QR"]
  P -.-> Pj["📓 order.placed"]
  P -.-> Pt["🔑 jeton de retrait<br/>retrait ET livraison"]
  P -.-> Pd["📄 bon de commande PDF<br/>archivé ; QR de retrait en retrait seulement"]

  C -.-> Cf["🖨️ fiche d'atelier + dossier du jour<br/>QR de colisage, aucun montant"]

  R -.-> Rm["📧 « votre commande est prête »<br/>+ QR reporté"]
  R -.-> Rj["📓 order.ready"]

  F -.-> Fa["🖊️ attestation — qui, quand, scan ou manuel"]
  F -.-> Fj["📓 order.handed_over"]
```

| Étape       | Ce qui sort                                                                                          | Pour qui            | Où                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `placed`    | 📧 accusé de réception, QR en ligne                                                                  | le client           | `send-order-placed-mail` / `send-order-settled-mail` — **attend le paiement** carte                                                                                  |
| `placed`    | 📧 « votre paiement n'est pas passé »                                                                | le client           | `send-payment-failed-mail`                                                                                                                                           |
| `placed`    | jeton de retrait                                                                                     | — (secret)          | à l'écriture, **pour les deux acheminements**                                                                                                                        |
| `placed`    | 📓 `order.placed`                                                                                    | l'analyse           | `growth/on-order-placed`                                                                                                                                             |
| `placed`    | 📄 bon de commande PDF                                                                               | le client           | `GET /orders/:id/bon.pdf`, archivé en R2 (`OrderSheetArchive`)                                                                                                       |
| `confirmed` | 🖨️ fiche d'atelier, compte à produire, dossier du jour                                               | le fournil          | fiche et compte en PDF (`GET /admin/production/batch/:date/…pdf`), dossier imprimé par le back-office                                                                |
| `ready`     | 📧 « votre commande est prête », QR reporté                                                          | le client           | `send-order-ready-mail` ; renvoyable par `POST /admin/orders/:id/pickup-reminder`                                                                                    |
| `ready`     | 📓 `order.ready`                                                                                     | la preuve           | `growth/on-order-ready`                                                                                                                                              |
| `fulfilled` | attestation de retrait                                                                               | l'équipe            | `production.order_handover` — la **source** ; la commande n'en garde qu'une copie                                                                                    |
| `fulfilled` | 📓 `order.handed_over`, avec `via`                                                                   | la preuve           | `growth/on-order-handed-over`                                                                                                                                        |
| `cancelled` | 📧 « pas abouti à temps » (clôture, impayé expiré) ; 📓 `order.abandoned` (abandon) ; 🔔 pour un pro | le client, l'équipe | `send-payment-expired-mail`, `on-order-abandoned`, `ring-failed-pro-settlement` — **corrigé le 2026-09-26**, cf. [abandon, §7](architecture-abandon-du-reglement.md) |

**Le QR de retrait est un secret, et il figure sur le bon PDF en retrait
seulement (depuis le 2026-10-09, vérifié le 2026-10-12).** En livraison le bon
voyage dans le carton et un coursier scannerait son propre colis : le rendu ne
dessine le QR qu'en `pickup`. Le PDF archivé le porte donc : « risque accepté »,
écrit dans `domain/services/order-sheet-pdf.ts` (le QR n'ouvre que
`/retrait/<jeton>`, qui exige un staff avec le droit du retrait). Le QR de
**colisage** n'encode que le numéro de commande, déjà imprimé en clair.
Ancienne version : « jamais sur un document ».

**Le second courriel est celui qui sert.** « Prête » est le seul moment où le
client a quelque chose à **faire**. Le QR y est reporté parce que personne ne
remonte un fil de courriels, téléphone en main, devant un comptoir.

**Les témoins du journal sont idempotents par commande** (`order.handed_over:<id>`)
et tournent hors de la requête : un fait rejoué n'en fabrique pas un second, et
une panne du journal ne bloque pas le comptoir.

## 4. Les règles tenues par le code

- **Les états ne reculent jamais.** Aucun chemin ne ramène `ready` vers
  `confirmed`, ni `fulfilled` vers `ready`. Une commande remise ne peut plus
  être colisée.
- **Chaque transition est une écriture conditionnée** (`updateMany` + `where`) :
  deux comptoirs qui scannent en même temps, un abonné rappelé, une clôture
  rejouée — la base tranche, une seule écriture gagne.
- **L'instant vient du fait, pas de l'horloge du commerce.** `readyAt` est
  l'heure du colisage au fournil, `handedOverAt` celle du retrait.
- **`confirmedAt` n'a pas d'auteur**, `readyBy` et `handedOverBy` en ont un —
  l'id de fiche staff, figé (le `sub` Auth0 avant le 2026-09-18). Une journée qui bascule n'est pas un acte constaté ; un
  colisage et une remise le sont.
- **« Reprendre la fabrication » existe, mais au fournil** :
  `POST /admin/production/worksheet/:date/retake` agit sur la fiche de travail,
  pas sur le statut de la commande.
- 🔴 **`fulfilled` n'est pas terminal PAR LE CODE.** Rien dans l'agrégat
  `Order` ne l'interdit ; c'est l'absence de toute transition sortante qui le
  rend terminal aujourd'hui. Le jour où une annulation existera, elle devra le
  refuser explicitement. ⚠️ **Précisé le 2026-09-26** : l'annulation existe,
  mais ne part que d'une commande `placed` non encaissée, condition écrite dans
  le `where` ; elle n'atteint donc pas `fulfilled`. La phrase reste vraie pour
  une annulation de commande payée.

**Qui écrit `cancelled`** (vérifié le 2026-10-12, `prisma-order.repository.ts`
et `prisma-unsettled-shop-order.canceller.ts`) : `markAbandoned` (abandon d'un
particulier), `failAtClosing` (balayage de la clôture) et l'expiration des
impayés de la boutique (`canceller`). Les trois écrivent `cancelled` + `failed`
sous `status = placed`. Une annulation par le staff est en chantier
([`plan-annulation-de-commande.md`](plan-annulation-de-commande.md)).

## 5. Ce que le client en voit — la frise

`packages/b2b-ui/src/order/order-timeline.ts` dérive la frise de `status` et de
`paymentStatus`.

| Jalon affiché                      | Rang | Allumé quand                                                         |
| ---------------------------------- | ---- | -------------------------------------------------------------------- |
| Commande reçue                     | 1    | `placed`                                                             |
| Confirmée                          | 2    | `confirmed`                                                          |
| En préparation                     | 3    | ⚠️ `in_production` — jamais courant, il passe à « fait » au colisage |
| Prête au retrait · Prête au départ | 4    | `ready`                                                              |
| Confiée au coursier · En livraison | —    | **non suivis** : allumés seulement à la remise                       |
| Retirée · Livrée                   | 5    | `fulfilled`                                                          |
| Commande annulée                   | —    | `cancelled` — atteint depuis le 2026-09-26 (abandon, clôture)        |

🔴 **Écart avec le serveur (constaté le 2026-09-17).** La frise considère qu'un
règlement `pending` **bloque** la production, pour tout le monde
(`blocksProduction`). Le compte de production, lui, fabrique un **pro** dont le
paiement est encore en vol. Un pro qui paie par carte voit donc une frise
arrêtée sur une commande que le fournil prépare. À trancher : aligner la frise
sur la clientèle, ou l'assumer le temps d'un webhook.

> ✅ **Fermé le 2026-09-26** : c'est le serveur qui s'est aligné. Un règlement
> `pending` ne produit plus pour personne (D2, `09128f9aa`) ; la frise
> (`pending` ou `failed` bloquent) et le compte de production disent la même
> chose.

## 6. La cible — ce qui reste doc-first

```mermaid
stateDiagram-v2
    [*] --> placed
    placed --> confirmed
    confirmed --> in_production
    in_production --> ready
    ready --> fulfilled: retrait
    ready --> in_delivery: livraison
    in_delivery --> fulfilled
    placed --> cancelled
    confirmed --> cancelled
    in_production --> cancelled
    fulfilled --> [*]
    cancelled --> [*]
```

| Changement             | Ce qu'il demande                                                                                                                        | État                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `in_production` écrit  | un geste « je lance » — que l'atelier ne fait pas avant de pétrir                                                                       | ⛔ ; la frise et la permissivité du colisage vivent sans                                                                                                                                             |
| `in_delivery` ajouté   | une valeur d'énuméré (migration additive) et le geste « remis au coursier », livraison seulement                                        | ⛔                                                                                                                                                                                                   |
| `cancelled` écrit      | une transition **staff**, qui se propage au fournil — sinon il colise pour rien                                                         | 🟡 — écrit depuis le 2026-09-26 pour un règlement non encaissé, par le client et la clôture ([abandon](architecture-abandon-du-reglement.md)) ; l'annulation **staff** d'une commande payée reste ⛔ |
| `draft` retiré         | retirer une valeur d'énuméré : migration en trois temps, et les lecteurs qui la testent (`packingBlocker`, `handoverBlocker`, la frise) | ⛔ — le brouillon vit dans `order_drafts`, le panier dans `shop_carts`                                                                                                                               |
| terminal par l'agrégat | `fulfilled` et `cancelled` refusés comme point de départ, dans une méthode de l'agrégat                                                 | ⛔                                                                                                                                                                                                   |

## 7. Les décisions de conception, conservées

**Le client n'écrit qu'une transition** : celle qui crée la commande. Tout ce
qui suit est un fait constaté par ceux qui font le travail — laisser le client
déclarer « je l'ai récupérée » ferait de son confort une source de vérité
comptable.

**`confirmed` est une journée qui bascule, pas une décision par commande.**
L'API n'a aucun planificateur, et une lecture n'écrit jamais : le geste retenu
est celui que l'équipe faisait déjà — arrêter de prendre pour le lendemain. D'où
`confirmed_at` sans `confirmed_by`.

**`cancelled` sera staff, pas atelier.** Annuler, c'est rembourser, prévenir, et
parfois offrir : une décision commerciale. ⚠️ **Précisé le 2026-09-26** : pour
une commande **payée**. Un règlement qui n'a jamais été encaissé s'annule sans
décision commerciale — par le client qui abandonne, ou par la clôture.

**L'énuméré ne décrit que la fabrication.** Fusionner le règlement produirait
une trentaine d'états que personne ne saurait dessiner.

**Ce qui bouge après une commande passée est un avenant**
([`architecture-commande-immuable-avenants.md`](architecture-commande-immuable-avenants.md)),
pas un retour en arrière du statut.

## 8. Ce que ce document ne tranche pas

- **La granularité par ligne.** Deux articles prêts sur cinq ne font pas une
  commande prête. Suivre ligne par ligne est un autre modèle — le fournil a
  déjà ses coches par ligne sur la fiche de travail, le commerce non.
- **Le retard.** « Aurait dû être prête » est une lecture, pas un état.
- **Qui est « l'atelier ».** Aujourd'hui, le droit `b2b_orders` suffit pour
  arrêter, coliser et remettre. Le jour où l'atelier devient un rôle, ces trois
  routes sont le premier périmètre à murer.
- **L'annulation par le client.** Avant `confirmed` elle serait défendable, et
  elle ouvre le remboursement automatique. ⚠️ **Précisé le 2026-09-26** : le
  client particulier abandonne déjà une commande **non réglée**
  ([abandon, §4](architecture-abandon-du-reglement.md)) ; reste ouverte
  l'annulation d'une commande payée.

## 9. Documents voisins périmés (constaté le 2026-09-17)

- [`../production/architecture-contexte-production.md`](../production/architecture-contexte-production.md)
  s'ouvre sur « ⛔ non implémenté » et « `src/` ne porte pas de dossier
  `production` ». Le bloc et le schéma `production` existent.
- [`architecture-flux-commande-prod.md`](architecture-flux-commande-prod.md)
  décrit une topologie à cinq Workers ; un seul container porte l'API.
