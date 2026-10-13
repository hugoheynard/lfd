# Plan C7 — un particulier annule après l'arrêt du plan de production

> **État au 2026-10-13 : doc-first, prêt à bâtir, rien n'est bâti.**
> `vitruve` l'a contredit le 2026-10-13, et Hugo a répondu « corrige tous les
> bloquants ». Ce plan s'ajoute à
> [`annulation-par-le-client.md`](annulation-par-le-client.md), passe par le
> noyau de [`annulation-par-le-staff.md`](annulation-par-le-staff.md) et
> allonge l'ordre de [`verrous-de-l-annulation.md`](verrous-de-l-annulation.md).
>
> 🔴 **Ordre entre les lots.** C7 se bâtit **après** le correctif du délai des
> particuliers (« délai actif par défaut »), en cours chez un autre agent. Ce
> correctif touche `prisma/schema/public/settings.prisma` et
> `b2b/order-opening/domain/customer-cancellation-settings.ts`, que C7
> modifie aussi. Bâtir les deux en parallèle ferait deux migrations sur la
> même table.

## Les décisions de Hugo (2026-10-13)

1. « si la direction décide d'autoriser l'abandon d'une commande au
   particulier même si elle a été produite » : c'est « un réglage global pour
   les particuliers », dans Réglages › Commandes. Les pros ne sont pas
   concernés.
2. « je ne peux pas avoir le choix avec un select en admin, choisir l'étape de
   statut ou annulable à tout moment ? » : le réglage est donc un **choix
   d'étape**.
3. Le délai de N h avant le créneau reste un réglage **à part**. Il s'ajoute à
   l'étape choisie quand il est actif.
4. « pas de bac ni de tournée en particulier » : on ne défait jamais un bac de
   livraison ni une tournée pour un particulier. ⚠️ **Ce n'est pas un fait du
   code, c'est un réglage.** Un particulier **peut** être livré quand
   `DeliveryAvailability.openToB2c` est vrai (`settings.prisma`,
   `delivery-window.ts:51` `WindowRequester = "individual"`,
   `order-drafting.service.ts:477`, vérifié le 2026-10-13). C7 le traite donc
   par un refus (§3.1).
5. Valeur posée au départ : « jusqu'à l'arrêt du plan de production ».
6. « oui le staff suit » : pour une commande de particulier, le staff a la
   **même** limite que le client, et jamais moins de droits que lui (§4).

## 1. Ce que le code distingue (vérifié le 2026-10-13)

| Étape          | Où elle s'écrit                                                                                           | Qui l'écrit                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| inscrite       | `production.production_order`, puis `orders.status = confirmed` **en différé** (`absorbIntoPlan`)         | la clôture ou le retirage, sous `ProductionDayLock`                                                                          |
| feuille tirée  | `packing.packing_order` (clé `(service_day, order_id)`), par `drawOrder` en `createMany … skipDuplicates` | l'abonné durable de `packing-list-drawn`                                                                                     |
| feuille fermée | `packing_order.packed_at`                                                                                 | `close-packing-order.handler.ts`. Il ne prend **que** la feuille (`lockedSheet`), ni la réserve, ni `orders`, ni la journée. |
| prête          | `orders.status = ready`                                                                                   | `MarkOrderReadyHandler`, seul appelant : l'abonné durable de `packing.order_packed`                                          |
| rouverte       | `PackingSheet.reopen()` remet `packed_at` à nul. La commande **reste `ready`** et aucun fait ne part.     | le colisage                                                                                                                  |
| retirée        | `orders.status = fulfilled`                                                                               | le comptoir, ou le livreur                                                                                                   |

Le retrait passe lui aussi par le colisage : un particulier en retrait a une
feuille. « Prête » se lit donc de **deux** façons, et C7 refuse si l'une ou
l'autre est vraie (§3.1) :

- `orders.status = ready` : couvre une feuille rouverte après qu'elle a été
  marquée prête ;
- `packed_at` non nul : couvre un `markReady` en retard.

## 2. Le réglage

Le réglage est une colonne additive de `public.customer_cancellation_settings` :
`b2c_cancellable_until`, de type enum Postgres `customer_cancellation_stage`,
`NOT NULL DEFAULT 'production_plan'`. Côté domaine, c'est la liste close
`CustomerCancellationStage`. 🔴 Ces valeurs sont **irréversibles** dès la
première ligne écrite en production. À l'écran `/b2b/reglages/commandes`,
c'est un `fold-listbox`, avec pour titre « Jusqu'où un particulier peut-il
annuler ? ».

| Valeur            | Libellé                                   | Lot                                                         |
| ----------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `production_plan` | « Jusqu'à l'arrêt du plan de production » | existant, défaut                                            |
| `ready`           | « Jusqu'à ce que la commande soit prête » | **C7**                                                      |
| `handover`        | « Jusqu'au retrait au comptoir »          | C7b. La valeur n'entre dans l'enum **qu'avec** ce lot (§6). |

La valeur n'est pas datée : comme pour le délai, le journal de l'annulation
fige l'étape qui a été appliquée.

## 3. C7 — l'étape `ready`

### 3.1 Le critère, dans l'ordre

Commande **personnelle** seulement, et seulement si l'étape est `ready`. Une
commande de société et l'étape `production_plan` gardent la règle d'avant.

1. La règle actuelle, **sauf** le blocage `inscribed`.
2. `orders.status = ready` → refus **`ready`**, posé **avant tout guichet**.
3. **`fulfillment_method = delivery` et inscrite** → refus
   **`delivery_after_plan`**. La valeur est lue **sous le verrou `orders`**,
   saisie staff comprise. Phrase : « Une commande en livraison ne s'annule
   plus après l'arrêt du plan de production. Contactez la boutique. » On ne
   défait ni bac ni tournée.
4. Le guichet du fournil, puis celui du colisage, sous leurs verrous (§3.3) :
   - `packed_at` non nul → refus **`packed`** (« déjà prête ») ;
   - **un contenant de la feuille porte un bac de livraison vivant**
     (`PackingSheet` sait les lister, cf. le JSDoc de `reopen`) → refus
     **`delivery_bin`**. C'est un défaut de cohérence pour un retrait, mais
     il est refusé, jamais défait.
5. `updateMany` conditionné sur `status IN (placed, confirmed)` et
   `status <> ready`. Si **0 ligne** est écrite, l'issue est nommée
   `orders.cancel.state_changed`. Le service relit la commande, rend le refus
   exact (`ready`, `fulfilled`…), et **toute** la transaction s'annule,
   retrait au fournil et au colisage compris.

Le délai de N h passe devant, comme aujourd'hui.

### 3.2 Les ports

- **Commerce → fournil (écriture).** On étend `OrderWithdrawalDesk.withdraw(day,
orderId, allowance)`, avec `allowance` égal à `"before_inscription" |
"before_packing"`. Les issues deviennent `withdrawn`, `inscribed`,
  `withdrawn_after_inscription`, `packed`, `delivery_bin`. Le port est déjà
  dans `production/channels/commerce/`, la seule surface que
  `context-boundaries.mjs` ouvre au commerce (`"b2b→production"`).
- **Fournil → colisage (écriture).** Nouveau port `PackingWithdrawalDesk`,
  **déclaré** par le fournil dans `production/channels/packing/` et
  **implémenté** par le colisage, comme `PackedOrdersReader`. L'appel se fait
  dans l'unité de travail de l'appelant. `production → packing` reste
  interdit.
- **Commerce → « est-elle prête ? » (lecture, aperçu sans verrou).** Nouveau
  lecteur `OrderPackingStateReader.packedAmong(orderIds): Map<id, PackedState>`,
  **déclaré** dans `production/channels/commerce/` et **implémenté** par le
  colisage. `appBootstrap` relie les deux. La lecture se fait **par lot
  d'identifiants**, pas par journée : « Mes commandes » et la supervision
  lisent plusieurs commandes de jours différents. Le commerce ne lit jamais
  `production/channels/packing/`.

### 3.3 Ce que fait le colisage, et la course avec la liste

La pierre tombale et la feuille partagent **la même clé**
`(service_day, order_id)`. On ajoute une colonne nullable `withdrawn_at` à
`packing.packing_order`.

- **L'annulation** fait un `INSERT … ON CONFLICT (service_day, order_id) DO
UPDATE SET withdrawn_at = $now WHERE packed_at IS NULL`, puis relit sous
  `FOR UPDATE`.
  - Si la feuille n'existe pas encore, c'est une ligne pierre tombale. Les
    colonnes descriptives viennent de l'instantané de clôture que le fournil
    tient (`production_order`) et passent par le port.
  - Si `packed_at` n'est pas nul, l'issue est `packed` et rien n'est écrit.
- **`drawOrder`** (`prisma-packing-shadow.ledger.ts`, `skipDuplicates`,
  vérifié le 2026-10-13) laisse déjà une ligne existante intacte, donc il
  respecte `withdrawn_at`. Il faut ajouter une chose : ne **pas** insérer les
  `packing_line` d'une feuille retirée. Il relit `withdrawn_at` après
  l'insertion de la feuille, dans la même transaction.
- **L'agrégat** : `PackingSheet.seal()`, `allocate`, `reopen` refusent une
  feuille retirée (`PackingSheetWithdrawnError`). Le tableau du poste et la
  proposition l'écartent.
- **Feuille déjà entamée** : les lignes rangées dans des contenants reviennent
  à la réserve du jour par `PackingStock.giveBack`, sous `stocks.lock(day,
sku)`, triés par SKU. Les contenants vides sont annulés. Le précédent est
  `PackingReturnDesk`, appelé par les abonnés durables `on-return-requested` et
  `on-handed-to-packing`. Il ne tient que le verrou de la réserve, jamais la
  feuille ni la journée (vérifié le 2026-10-13). Cela répond à V2 : la réserve
  accepte le retour.

**Ordre des verrous** : ligne `orders` → journée du fournil → feuille du
colisage → réserve (triée par SKU) → titulaire du bon. La fermeture prend la
feuille seule. `allocate-to-container` et `apply-packing-proposal` prennent la
feuille puis la réserve (`container-support.ts`). Le retour au fournil prend
la réserve seule. Personne ne remonte d'une flèche, donc il n'y a pas de cycle.

### 3.4 Effets

| Bloc      | Effet                                                                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fournil   | Le compte à produire et les fournées restent inchangés. `order_withdrawal.after_inscription = true`. La supervision affiche un compteur « annulées après l'arrêt » à part (`day-supervision.ts` compte par statut).                 |
| colisage  | La feuille est retirée et sort du poste. **Le surplus revenu en réserve est visible** à trois endroits : au poste (réserve du jour, ligne « rendu par une annulation »), dans la supervision (même compteur), et au journal (§3.5). |
| comptoir  | La file n'écartait pas les annulées. C'est corrigé **à part** par le lot `fix(comptoir)` en cours. C7 en dépend et ne le refait pas. `markFulfilled` refuse déjà une annulée.                                                       |
| livraison | Rien : refus `delivery_after_plan`.                                                                                                                                                                                                 |
| argent    | Noyau inchangé : C4 rembourse, l'intention due est fermée, C3b refond le bon. Pas de « au compte » pour un particulier.                                                                                                             |

### 3.5 Journal, courriel, écrans

- **Journal** :
  - le fait `order.cancelled` gagne les champs `afterInscription` et
    `stageApplied`, lus comme `false` et `production_plan` sur un fait plus
    ancien ;
  - le fournil publie un fait durable `production.order_withdrawn_after_close`
    (jour, commande) ;
  - le colisage publie `packing.sheet_withdrawn` (jour, commande, lignes
    rendues à la réserve).

  Tous deux sont journalisés : ce sont eux qui expliquent un compte à produire
  plus grand que les feuilles.

- **Courriel** : `customer.order-cancelled`, inchangé. Il ne peut pas y avoir
  de courriel « prête » parti, puisque `ready` est refusé. La **cloche** à
  l'équipe dit « après l'arrêt : feuille retirée du colisage ».
- **Écrans** :
  - la boutique (`cancellability`) lit par lot via `OrderPackingStateReader` ;
  - la supervision et le poste de colisage affichent un badge « annulée après
    l'arrêt » ;
  - Réglages affiche la liste.

## 4. Le staff suit l'étape (Q2 tranchée)

- **Dans la règle.** `cancellationOf` reçoit une **autorisation**
  `{ allowance: "before_inscription" | "before_packing" }`. Le noyau
  `OrderCancellation` la calcule **une fois**, pour tout acteur :
  `before_packing` si la commande est personnelle **et** que l'étape est
  `ready`, sinon `before_inscription`. Le staff, le particulier connecté et
  l'invité obtiennent donc la même limite. Le délai de N h et le motif
  restent propres au client.
- **Écran staff** : `GET /admin/orders/:id` porte `cancellability` calculée
  avec la même autorisation. Le bouton du back-office propose l'annulation
  jusqu'à « prête », et la confirmation dit « après l'arrêt du plan : ce qui
  est fabriqué reste fabriqué ».

## 5. Les tests

- **Unitaires** :
  - `cancellationOf` pour chaque étape × chaque état × chaque acteur ;
  - l'ordre des refus (`ready` avant le guichet, `delivery_after_plan` avant
    le guichet) ;
  - l'agrégat refuse `seal`, `allocate` et `reopen` sur une feuille retirée.
- **E2E** :
  - `production_plan` : refus d'une inscrite, pour le client comme pour le
    staff ;
  - `ready` avant la feuille, après la feuille, avec une feuille entamée :
    réserve rendue, compte à produire inchangé, remboursement demandé, faits
    journalisés ;
  - un pro : refus ;
  - un invité ;
  - le staff sur une commande de particulier ;
  - délai de N h plus `ready` ;
  - **livraison d'un particulier (`openToB2c` vrai) : `delivery_after_plan`,
    saisie staff comprise**.
- **Courses** :
  - feuille tirée **puis** annulation, et annulation **puis** feuille tirée :
    aucune ligne de feuille vivante, aucun `packing_line` ;
  - fermeture du bac et annulation en parallèle : une seule gagnante ;
  - fermée → rouverte → `markReady` en retard, puis annulation : refus
    `ready`, et aucun courriel « prête » envoyé à cause de l'annulation ;
  - `markReady` qui gagne entre le guichet et l'`updateMany` : 0 ligne →
    `state_changed`, la transaction est défaite et la feuille n'est pas
    retirée.

## 6. Hors de C7

- **C7b, `handover`** : défaire une feuille fermée, la file du comptoir, la
  garde, et le client aura déjà reçu le courriel « prête ». Ce lot est à
  concevoir seulement si Hugo le veut.
- **Au bâti, documentation** : corriger le commentaire de
  `prisma/schema/production` sur `order_withdrawal` (lignes 710-731 selon
  `vitruve`) pour qu'il dise `after_inscription`. Ajouter `withdrawn_at` et la
  pierre tombale à [`../../colisage/colisage.md`](../../colisage/colisage.md).

## 7. Questions restantes pour Hugo

| #   | Question                                                  | Défaut prudent                 |
| --- | --------------------------------------------------------- | ------------------------------ |
| Q1  | Bâtir C7b (jusqu'au retrait) ?                            | Non.                           |
| Q3  | Remboursement intégral après l'arrêt ?                    | Oui, c'est le noyau C4.        |
| Q4  | Le surplus rendu à la réserve : un geste pour le vendre ? | Non, il est seulement visible. |
