# Plan — la Supervision du jour

> Ouvert le 2026-09-25, à la demande de Hugo : « il me manque un endroit pour
> superviser à la fois le suivi de prod, de packing, de retrait et de
> livraison », puis « supervision doit être orienté view, donc à part ».
> État : **doc-first**.

## Ce que c'est

Une **vue**, en lecture seule, pour une date de service : où en est chaque
commande entre la passation et la remise, et lesquelles sont en retard. Elle
n'agit pas : elle renvoie vers l'écran de terrain qui agit (fournée, colisage,
file de retrait). Elle est **à part** des espaces de travail — Production,
Comptoir, Livraison restent les postes de ceux qui font ; la Supervision est
la place de celui qui regarde l'ensemble.

## Ce qui existe (vérifié le 2026-09-25, contredit par vitruve le même jour)

Tout ce dont la vue a besoin est **déjà sur la commande** (`public.orders`),
recopié par le commerce à chaque fait des autres blocs :

| Étape affichée   | Statuts                        | Qui l'écrit                                                                                                                                                     |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commandée        | `placed`                       | passation                                                                                                                                                       |
| En production    | `confirmed`, `in_production`   | `confirmed` : `OnProductionDayClosed` (clôture du jour). `in_production` n'est écrit par **aucun** handler ; une ligne héritée qui le porterait est comptée ici |
| Prête            | `ready` (+ `readyAt`)          | `OnOrderPacked` ← `OrderPackedEvent` (scan de colisage)                                                                                                         |
| Retirée / Livrée | `fulfilled` (+ `handedOverAt`) | `OnOrderHandedOver` ← `OrderHandedOverEvent`                                                                                                                    |
| Annulée          | `cancelled`                    | à part, jamais en retard                                                                                                                                        |

`draft` est exclu. « Colisée » **est** « prête » : le scan de colisage écrit
`ready` ; le colisage ligne à ligne (schéma `production`) n'est pas repris.

- **Clé du jour** : `requestedDeliveryDate`, **nullable**. Une commande sans
  date n'appartient à aucun jour : la vue ne l'invente pas, mais elle la
  **compte** dans un signal à part (« N commandes sans date de service » — les ouvertes seulement : ni retirée ni annulée, qui ne demandent plus de geste) pour
  que le trou se voie au lieu de disparaître du filtre.
- **Le créneau** : `fulfillment` est `Json?` de forme
  `{ window: { value: FulfillmentWindow | null, source }, … }`
  (`packages/contracts/src/order.ts`). `value` peut être nul (aucune tranche
  demandée), et `source: "default"` désigne une **heure d'ouverture recopiée**
  — l'heure du point de retrait, pas une
  promesse faite au client. La lecture réutilise `fulfillmentOf` / `windowOf`
  de `b2b/orders/infrastructure/handover-order.query.ts`, extraits dans un
  fichier partagé du même dossier : **un seul parseur de ce JSON**.
- **Ce que le fournil fabrique** : `settlementWhere()`
  (`b2b/orders/infrastructure/plan-filter.ts`) — la même moitié « argent » que
  le dossier du jour, et pour la même raison : on garde les commandes prêtes
  et retirées, on écarte les règlements morts et le visiteur dont la carte est
  restée en l'air. La vue supervise **ce qu'on fabrique**, ni plus ni moins.
- **Particuliers** : leurs commandes sont dans `public.orders`
  (`clientele = public`, `companyId` nul ; `clientele` nul sur l'historique).
  Elles sont supervisées comme les autres. Le nom affiché vient de la société
  si elle existe, sinon de `placedBy` — le nom seul, jamais e-mail ni
  téléphone.
- **Livraison** : aucune donnée de tournée. Une livraison passe de `ready` à
  `fulfilled`, sans « en route ». La vue ne l'invente pas.

**Frontière** : la lecture n'a besoin d'aucun autre bloc. Elle vit dans
`b2b/orders`, sur ses propres tables — rien de neuf dans la matrice.

## Serveur

- Ressource **`b2b_supervision`** (« Supervision »). Une vue en lecture seule,
  mais `admin` la reçoit en `write` : c'est l'invariant « l'administrateur
  couvre tout », qu'un test du contrat exige, pas une contradiction.
  Même chemin que `b2b_counter` (`82846b1f3`) : valeur d'enum Postgres
  (irréversible — **le nom se tranche avant le premier merge**), deux
  migrations (la valeur ne s'emploie pas dans sa transaction d'ajout),
  `staff-access.ts` et libellé, `grant-chips.spec`, `staff-roles.e2e-spec`,
  `architecture-acces-staff.md`. **À trancher par Hugo** : l'accorder
  d'office à un autre rôle qu'`admin`.
- **Ce que le droit ouvre, écrit** : le nom des clients du jour, particuliers
  compris, toutes sociétés. C'est moins que `b2b_orders:read` (pas de lignes,
  pas de montants, pas de contact), mais c'est un élargissement pour qui n'a
  pas ce droit — à l'inverse du mouvement de `b2b_counter`. Assumé : on ne
  supervise pas une file de numéros.
- `GET /admin/supervision/day?date=YYYY-MM-DD` → `GetDaySupervisionQuery`,
  `@AdminSurface("b2b_supervision")`. Rend :
  - `flow` : par acheminement, le compte par étape (annulées à part) ;
  - `late` : les commandes en retard — numéro, nom affiché, acheminement,
    créneau, étape, **règle qui la signale** ;
  - `undated` : le nombre de commandes sans date de service ;
  - `asOf` : l'instant de lecture (`Clock`).
    Aucun montant.
- **Les règles de retard** — fonctions pures du domaine, testées sans Nest.
  Elles ne jugent **que les créneaux promis** (`value` non nul et
  `source ≠ "default"`) ; les autres commandes s'affichent avec « heure
  d'ouverture » ou « sans créneau », jamais en retard :
  1. **pas retirée / pas livrée après son créneau** : étape ≠ retirée et
     `now > localToInstant(date, window.end)` ;
  2. **pas prête à l'approche du créneau** : étape ∈ {commandée, en
     production} et `now > localToInstant(date, window.start ?? window.end) −
READY_BEFORE_WINDOW_MINUTES`.
     Le temps passe par `packages/contracts/src/paris-time.ts`
     (`localToInstant`, `addMinutes`) et le `Clock` — jamais `new Date()`.
     `localToInstant` peut rendre `null` (heure inexistante au changement
     d'heure) : la commande n'est alors pas jugée, et la règle ne l'invente pas.
     La marge est une **constante nommée du domaine** ; **valeur à fixer par
     Hugo**, réglable dans un lot suivant s'il le veut.
- Hors règles, au premier lot : un retrait **fait** en retard n'est pas
  signalé (`handedOverAt` est lu, pas jugé).

## Front

- Route de premier niveau **`/supervision`**, garde `b2b_supervision:read`,
  entrée à part dans le menu principal et la tuile mobile, hors des espaces
  Production / Comptoir.
- Une page : sélecteur de date (aujourd'hui par défaut), deux lignes de flux
  (Retrait, Livraison), un compte par étape — un clic filtre la liste —, le
  signal « sans date » s'il est non nul, puis la liste des retards, la règle
  écrite en clair (« Créneau 7 h–8 h dépassé, pas retirée »).
- Rafraîchissement périodique : `production/periodic-refresh.ts` **déménage**
  dans `shared/` (il sert désormais deux espaces), ses importeurs suivent.
- Une ligne renvoie à l'écran de terrain **seulement si** le lecteur en a le
  droit (`/commandes/:id` sous `b2b_orders:read`) ; sinon ce n'est pas un
  lien. La Supervision ne devient pas une porte dérobée.
- Vocabulaire : « Retirée » et « Livrée », jamais « remise » (§8).

## Tests

- Unitaires : chaque règle aux bornes — pile à `end`, une minute après,
  créneau sans `start`, `value` nul, `source: "default"` jamais en retard,
  `localToInstant` nul, annulée jamais en retard, `in_production` compté en
  production.
- e2e : 403 sans le droit ; le flux compte juste sur un jour semé (dates
  **relatives**) ; une commande d'un autre jour n'y entre pas ; une commande
  sans date est comptée dans `undated` ; une commande particulier en attente
  de carte n'y entre pas, une commande pro en attente si ; aucun montant ni
  e-mail dans la réponse.

## Hors périmètre

- Le suivi de tournée (« en route », livré par qui, quand) : il attend le
  module Livraison.
- Le colisage partiel ligne à ligne.
- Retirer la Production au rôle `comptoir` : sujet voisin, traité à part.
