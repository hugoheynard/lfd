# Plan — les fournées progressives : une ligne de fiche qui avance, pas une case

> **État : ✅ bâti le 2026-09-28** (F1 à F3, commits suivant `b9055b430`). Ouvert le 2026-09-28 (Hugo : « avant les
> stores, il faut l'incrémentation progressive d'une ligne de production, au
> lieu d'une checkbox »). Porte une **migration de données** : `vitruve` avant
> Hugo. **Contredit par `vitruve` le 2026-09-28** : 4 BLOQUANT, 7 SÉRIEUX,
> tous repris (§8).

---

## 0. Pourquoi

Une ligne de la fiche d'atelier dit « 200 croissants » et se coche **une fois**,
quand tout est sorti. Entre-temps, rien ne dit qu'il en est déjà sorti 96 :

- le colisage attend le dernier croissant pour mettre le premier au bac ;
- la Supervision et le comptoir montrent « au four » jusqu'au bout ;
- la barre par produit du détail de préparation (demandée le 2026-09-28,
  « on garde ça pour tout à l'heure ») n'a rien à montrer.

---

## 1. Ce qui existe

Ouvert le 2026-09-28.

| Fait                                                                                                                                                                                                                                  | Où                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Le compte à produire est une ligne par `(service_day, sku)`, avec `quantity` et un état « fait » en trois colonnes : `done_at`, `done_by`, `done_initials`. `done_at = null` est le seul état « pas fait ».                           | `prisma/schema/production.prisma`, `ProductionCount`                                |
| Cocher / décocher = `MarkWorksheetLineCommand` / `UnmarkWorksheetLineCommand`, qui passent par `itemToMark` puis une **écriture ciblée** `markProduced` (six postes cochent six fiches en même temps ; un `save` réécrit la journée). | `application/commands/mark-worksheet-line.*`, `prisma-production-day.repository.ts` |
| Recocher réécrit l'heure et les initiales : « le dernier geste est le vrai ».                                                                                                                                                         | JSDoc de `MarkWorksheetLineHandler`                                                 |
| Le colisage refuse une ligne dont le SKU n'est pas coché au compte : `awaitingOf` est un **booléen par SKU pour toute la journée**.                                                                                                   | domain/services/production-packing.ts (retiré en K3c), `awaitingOf`                 |
| Mettre une ligne au bac = écriture ciblée `markPackedLine`, sans verrou : l'agrégat a déjà dit oui.                                                                                                                                   | `prisma-production-day.repository.ts`                                               |
| **Le réglage « contenant » existe déjà** : `production_container` (`sku`, `units_per_container`, `singular`, `plural`) — « 4 tourneuses », « plaque entière ». La fiche d'atelier s'en sert pour traduire une quantité en matériel.   | `ProductionContainer`, `production-worksheet.ts` (`containerLabelOf`)               |
| Le contrat de la fiche porte `done`, `doneAt`, `initials` par ligne, et `doneCount` / `doneUnits` / `remainingUnits` par rayon, comptés au serveur.                                                                                   | `packages/contracts/src/production-worksheet.ts`                                    |
| Le retirage signale une ligne **déjà cochée** dont la quantité change (`WorkshopDriftLine.done`).                                                                                                                                     | même fichier                                                                        |
| Le comptoir lit l'étape « four » d'un sac par `awaitingProduction` ligne à ligne.                                                                                                                                                     | back-office `handover-detail/bag-readiness.ts`                                      |
| Toute table neuve du schéma `production` doit porter le déclencheur du journal de journée, sinon l'e2e de la porte D7 rougit.                                                                                                         | `test/day-change-triggers.e2e-spec.ts`                                              |

---

## 2. Les décisions de Hugo (2026-09-28)

1. **Deux gestes pour déclarer une sortie** : des boutons rapides **et** une
   saisie libre.
2. **Sortir plus que prévu est accepté et visible** (« 52 / 48 »). Moins reste
   « pas fini » tant que rien de plus n'est déclaré.
3. **Sortir du four, c'est mettre à disposition du colisage** — un seul geste
   (lecture A). Le transfert est **total** : tout ce qui sort passe au colisage.
4. **On produit parce qu'il y a une commande**, jamais dans le vide — les
   boutiques sont des clientes comme les autres. Un surplus n'est donc pas un
   stock : c'est un écart, qui se montre et ne s'attribue à personne.
5. **La taille de plaque est un réglage du fournil.** Elle existe déjà : c'est
   `production_container` (§1). Le bouton rapide « + 1 plaque » ajoute
   `units_per_container` pièces, avec le mot du réglage (« + 1 tourneuse »).
   Sans contenant réglé, pas de bouton rapide : on ne fabrique pas une plaque
   que personne n'a déclarée (pas de valeur inventée).

---

## 3. La conception

### D1 — Une fournée est une ligne, en ajout seul

```
production_batch
  id           text PK            — ULID, donné par le client : idempotence
  service_day  varchar(10)        — FK production_day
  sku          text
  quantity     int  > 0
  recorded_at  timestamptz
  recorded_by  text
  initials     text default ''
  cancelled_at timestamptz null
  cancelled_by text null
  INDEX (service_day, sku)
```

**Sorti(sku) = somme des fournées non annulées.** Pas de compteur
`produced = produced + n` sur `production_count` : deux postes qui déclarent
en même temps s'écraseraient (la même raison que les écritures ciblées d'aujourd'hui),
et un compteur ne dit ni qui, ni quand, ni quoi annuler.

L'`id` vient du client (ULID, comme les photos du contrôle qualité) : un double
appui ou une requête rejouée après une coupure ne compte pas deux fois.

### D2 — L'état d'une ligne se DÉDUIT

| Dérivé      | Règle                         |
| ----------- | ----------------------------- |
| `produced`  | Σ fournées non annulées       |
| `remaining` | `max(0, quantity − produced)` |
| `surplus`   | `max(0, produced − quantity)` |
| `complete`  | `produced ≥ quantity`         |

`complete` remplace le sens de `done`. Il n'est **écrit nulle part** — une
colonne « fait » à tenir en même temps que la somme serait une seconde vérité.

Un retirage qui change la quantité (30 → 42) fait repasser une ligne complète
à « pas finie » **tout seul**, sans rien réécrire. `WorkshopDriftLine.done`
devient « déjà commencée » (`produced > 0`), ce qui était déjà le cas
dangereux qu'il nommait.

### D3 — Déclarer, annuler

- **`RecordBatchCommand(serviceDay, sku, batchId, quantity, initials)`** —
  refusée par l'agrégat si la journée n'est pas arrêtée ou si le SKU n'est pas
  au compte (les refus d'`itemToMark`, déplacés, pas recopiés), si
  `quantity < 1`.
- **Idempotence** : `INSERT … ON CONFLICT (id) DO NOTHING`, puis relecture de
  la ligne portant cet `id`. Même charge (jour, SKU, quantité) → succès
  silencieux, **même si elle a été annulée depuis** (le rejeu ne ressuscite
  rien). Autre charge → refus 409 qui nomme le conflit. Deux requêtes
  identiques simultanées ne font donc jamais de 500.
- **`CancelBatchCommand(serviceDay, batchId)`** — une fournée saisie par erreur
  s'annule **entière**, tracée (`cancelled_at/by`), jamais supprimée. Pour
  corriger 48 en 36 : annuler, redéclarer 36. Annuler une fournée déjà annulée
  est un succès silencieux.
- **Refus d'annuler** si, après annulation, il resterait moins de pièces sorties
  que de pièces au bac pour ce SKU ce jour — **toutes** les lignes au bac,
  bacs fermés compris (§D4) : « 24 croissants sont déjà dans des sacs :
  ressortez-les du bac avant d'annuler cette fournée. » Une fournée d'un bac
  fermé ne s'annule donc plus : le sac est parti avec.
- **Aucune colonne dérivée n'est écrite** (§5) : ni `RecordBatch` ni
  `CancelBatch` ne touchent `production_count`. Deux fournées concurrentes ne
  peuvent donc rien s'écraser — la somme est la seule vérité.
- **Les anciennes commandes restent servies, au même contrat** (CLAUDE.md §0),
  le temps qu'un front déployé les appelle :
  - `Mark` = « rendre la ligne complète » : déclare une fournée de `remaining`,
    d'`id` déterministe `mark-<jour>-<sku>-<produced>`. Sur une ligne déjà
    complète, **succès sans effet** (recocher passait, recocher passe). Deux
    `Mark` concurrents calculent le même `id` : le second est absorbé par
    l'idempotence.
  - `Unmark` = annuler toutes les fournées de la ligne. **Il peut désormais
    être refusé** (pièces au bac) — c'est le seul changement de
    comportement, et il est voulu : aujourd'hui décocher une ligne dont les
    pièces sont en sac laisse le colisage mentir. Le refus nomme le geste de
    sortie.
  - Pas de file hors ligne côté fournil à rejouer (cherché le 2026-09-28 dans
    `apps/lfd-backoffice-frontend/src/app/production` : aucune ; le commentaire
    de production-day.packing.ts (retiré en K3c) qui l'évoque parle du scan).

### D4 — Le colisage puise dans ce qui est sorti

`awaitingOf` cesse d'être un booléen de journée :

```
disponible(sku) = sorti(sku) − Σ quantités des lignes de ce SKU au bac (bacs fermés compris)
```

Une ligne peut aller au bac **si `disponible ≥ sa quantité`** ; le refus nomme
le manque (« il manque 8 croissants sortis »). Le premier sac de 12 se remplit
dès que 12 sont sortis. La garde est `lineToFill` / `isAwaitingProduction`
(production-day.packing.ts (retiré en K3c)) ; `lineToPack`, qui sert aussi à **ressortir** du
bac, garde son asymétrie : ressortir n'est jamais refusé par le four.

Suivent le même calcul : `awaitingProduction` de la fiche de colis, et
`resourcesOf` (`exhausted = remaining === 0 && !awaitingProduction`), qui
devient « plus rien de disponible ».

🔴 **La course, et qui la sérialise.** Trois écrivains touchent l'invariant
« au bac ≤ sorti » : mettre au bac, annuler une fournée, et **`save` de la
journée** (clôture, retirage) qui supprime et recrée `production_count` **et
réécrit `packed_*` de chaque ligne** depuis un instantané chargé avant sa
transaction (constaté par `vitruve`, `prisma-production-day.repository.ts`).

Un verrou sur `production_count` ne tient pas : `save` détruit la ligne
verrouillée. Le verrou porte donc sur la ligne **`production_day`**, que
personne ne supprime :

- mettre au bac, ressortir du bac, annuler une fournée : une transaction
  `SELECT … FROM production_day WHERE service_day = $1 FOR UPDATE`, puis
  relecture de ce qu'il faut, puis écriture ;
- `save` (clôture, retirage) : **prend le même verrou et recharge l'agrégat
  sous lui**, au lieu de réécrire un instantané lu avant. Cela ferme aussi le
  trou d'aujourd'hui (un colisage validé pendant un retirage était effacé).

Le verrou sérialise **tous** les gestes de bac d'une même journée — six postes
qui colisent attendent chacun quelques millisecondes. C'est plus large qu'un
verrou par produit, et c'est le seul qui tienne face à `save`. Déclarer une
fournée ne le prend pas : elle ne fait qu'augmenter le disponible.

⚠️ **Non vérifié (toujours, au 2026-09-28)** : le comportement de `FOR UPDATE` dans une transaction
interactive à travers Prisma Accelerate (les e2e passent par l'adaptateur `pg`,
pas par Accelerate). F1 le teste sur `dev` avant de conclure.

### D5 — L'écran du fournil

Par ligne de la fiche, à la place de la case :

- une barre `produced / quantity` (et « +4 » en surplus, ton `warning`) ;
- **« + 1 plaque »** (le mot du réglage), si un contenant est réglé ;
- **« Saisir »** : un champ prérempli avec `remaining` (au moins 1), qui se
  valide d'un geste ;
- la liste des fournées de la ligne (heure, initiales, quantité), chacune
  annulable.

Une ligne complète descend dans « faites », comme une ligne cochée aujourd'hui.
Le téléphone garde le même tri `pending` / `done`.

### D6 — Ce que les autres écrans y gagnent

- **Supervision, détail de préparation** : la barre par produit demandée le
  2026-09-28 est `produced / quantity`, servie par la même lecture.
- **Comptoir** : la barre « four » compte les lignes disponibles ; rien d'autre
  ne change.
- **Version par journée** : `production_batch` est dans le schéma `production`,
  donc la porte D7 **exige** son déclencheur. Chaque fournée avance la version
  et rafraîchit les écrans.

### D7 — Journal

Les coches d'aujourd'hui sont `@sans-journal` (TODO de Hugo du 2026-09-19).
Une fournée est une ligne datée et signée, en ajout seul ; son annulation est
tracée par colonnes. **Ce n'est pas un fait journalisé** : le plan ajoute deux
commandes sous le même régime, et **élargit donc la dette** du TODO
`documentation/journalisation/todo-journal-activite.md`. Dit, pas masqué.

## 4. Contrats

`WorkshopLine` gagne `produced`, `remaining`, `surplus`, `batches` (id, quantité,
heure, initiales), et `container` (`unitsPerContainer`, `singular`) ou `null`.

`done` **reste servi**, avec le sens `complete` ; `doneAt` = heure de la
fournée qui a complété la ligne ; `initials` = celles de cette fournée. Un
front déployé qui ne connaît que la case continue d'afficher juste.

Le rayon garde `doneCount` (lignes complètes) et `doneUnits` devient
`Σ min(produced, quantity)` — le surplus ne gonfle pas l'avancement.

---

## 5. La migration — étendre, basculer, resserrer

**Principe, après `vitruve`** : aucune colonne dérivée n'est tenue en double.
Le nouveau binaire **n'écrit plus jamais** `done_*` ; les fournées sont la seule
vérité. `done_*` ne sert plus qu'à dire « coché par l'ancien système ».

1. **Étendre (M1)** : créer `production_batch` et son déclencheur de journal.
   **Rattrapage**, rejouable sans doubler :
   - clé **`(service_day, sku)`**, jamais `production_count.id` — un `cuid`
     que chaque `save` régénère ;
   - `id = 'backfill-' || service_day || '-' || sku` ;
   - seulement pour les lignes `done_at` non nul **ET sans aucune fournée** pour
     ce `(service_day, sku)`, via `INSERT … ON CONFLICT (id) DO NOTHING`.
2. **Basculer** : le binaire lit la somme des fournées. Une ligne `done_at` non
   nul **sans aucune fournée** (cochée par l'ancien binaire pendant la fenêtre
   de déploiement) compte comme une fournée implicite de `quantity`, en lecture.
3. **Qui change une quantité matérialise d'abord.** Le retirage est le seul
   geste qui change `quantity`. Sous le verrou de journée (§D4), **avant**
   d'absorber les arrivées, il écrit en vraie fournée (même `id` que le
   rattrapage) chaque coche implicite. Sans ça, 30 cochés puis 30 → 42
   deviendrait 42 sortis.
4. **Le retirage cesse de recopier les coches** (`absorbArrivals`,
   `production-count.ts`) : elles sont matérialisées au pas 3, et la copie
   ferait renaître une coche sur une quantité qui a changé.
5. **Resserrer (M2, livraison suivante)** : rejouer le rattrapage (même
   requête, sans effet sur ce qui est déjà matérialisé), retirer la lecture
   implicite. Retirer les colonnes `done_*` est une troisième livraison.

**Point de non-retour, dit** : dès qu'une fournée **partielle** existe, revenir
au binaire précédent la perd — il ne lit que `done_at`, nul sur une ligne à
moitié sortie. Le retour arrière est sûr **jusqu'à la première saisie partielle
en production**, plus après. Déployer F1 et F2 le même jour, un jour calme.

## 5 bis. Les lecteurs à traduire

Relevés par `vitruve` le 2026-09-28 (grep sur `done`, `doneAt`,
`awaitingProduction`, `doneUnits`, `remainingUnits`) :

- **API** : `production-worksheet.ts`, `production-worksheet-groups.ts`
  (`doneCount`, `doneUnits`), `production-worksheet-reading.service.ts`,
  `production-packing.ts` (`awaitingOf`, `resourcesOf`),
  production-day.packing.ts (retiré en K3c), `production-count.ts` (`absorbArrivals`).
- **Back-office** : `supervision/packing-cards.ts`,
  `supervision/preparation-shelves.ts`, `supervision/preparation-column/*`,
  `commercial/cockpit/cockpit-bar/today-handovers.ts`,
  `production/colisage/packing-gestures.ts`, `packing-line/*`,
  `packing-resources.html`, `fiche-atelier/drift-banner/*`,
  `handover-shop/handover-detail/bag-readiness.ts`.
- Aucun PDF ni prévisionnel trouvé qui lise `done` (non exhaustif : grep par
  noms).

**Un SKU retiré du compte par un retirage** garde ses fournées (leur clé
étrangère vise `production_day`). Elles restent visibles comme **surplus hors
compte** sur la fiche, et le bandeau d'écart du retirage prévient avant
(`produced > 0`).

## 6. Les lots

| Lot       | Contenu                                                                                                                                                                                                 | Qui                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **F1** ✅ | Migration M1 + rattrapage ; fournée dans l'agrégat (déclarer, annuler, refus) ; `Record/CancelBatch` ; disponible et verrou du colisage (D4) ; `Mark/Unmark` traduits ; lectures et contrats (§4). e2e. | `batisseur` + `lecteur-de-migrations` |
| **F2** ✅ | Fiche d'atelier : barre, « + 1 plaque », saisie, fournées annulables (D5).                                                                                                                              | `pablo`                               |
| **F3** ✅ | Supervision : barre par produit au détail de préparation ; comptoir vérifié.                                                                                                                            | `pablo`                               |

L'e2e de F1 porte aussi **le retirage pendant un colisage** (le colisage n'est
plus effacé), **le rattrapage rejoué deux fois** (aucune fournée doublée, y
compris après un `save` qui régénère les ids), **30 cochés puis 30 → 42** (la
ligne n'est pas complète), et `Mark` rejoué sur une ligne complète (succès).

L'e2e de F1 porte **la course** : deux mises au bac simultanées sur 12
disponibles pour deux lignes de 12 ; une seule passe.

---

## 7. Questions ouvertes

- ~~Q1 — Un bouton « + 1 » à l'unité ?~~ **Non** (Hugo, 2026-09-28).
- ~~Q2 — plaque de cuisson et contenant de livraison, même objet ?~~ **Non,
  et rien à faire** (vérifié le 2026-09-28) : `production_container` n'est lu
  que par la fiche d'atelier ; les « containers » du colisage
  (`DeclarePackingContainersCommand`) sont un simple **nombre** de bacs du
  véhicule par commande, sans réglage par produit.
- ~~Q3 — Qui peut annuler la fournée d'un autre ?~~ **Tout poste du fournil**, tracé (Hugo, 2026-09-28).
- **Q4 — Fermer un bac incomplet** reste permis (`PackOrder` ne vérifie pas
  les lignes, `production-day.ts`). Le plan n'y touche pas.

---

## 8. Les objections de `vitruve` (2026-09-28), et ce qu'elles ont changé

| #   | Objection                                                                                              | Reprise                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| B1  | Rattrapage clé sur `production_count.id`, régénéré par chaque `save` : production comptée deux fois.   | Clé `(service_day, sku)` (§5.1).                                                                         |
| B2  | Le rejeu du rattrapage doublait les lignes complétées par le nouveau binaire (qui écrivait `done_at`). | Le nouveau binaire n'écrit plus `done_*` ; rattrapage conditionné à « aucune fournée » (§5).             |
| B3  | Le verrou par `production_count` ne tient pas : `save` détruit la ligne et réécrit les `packed_*`.     | Verrou sur `production_day`, pris aussi par `save`, qui recharge sous lui (§D4). Ferme un trou existant. |
| B4  | Personne n'écrit `done_*` au retirage ni à l'annulation.                                               | Plus de colonne dérivée ; le retirage matérialise les coches implicites avant de changer une quantité.   |
| S1  | `Mark` traduit cassait recocher ; `Unmark` peut être refusé.                                           | `Mark` complet = succès, `id` déterministe ; refus d'`Unmark` assumé et nommé (§D3).                     |
| S2  | `RecordBatch` sans verrou mais écrivant une colonne dérivée.                                           | Plus de colonne dérivée (§D3).                                                                           |
| S3  | Idempotence sans mécanisme.                                                                            | `ON CONFLICT DO NOTHING` + relecture ; règles du rejeu d'une fournée annulée (§D3).                      |
| S4  | Lecteurs oubliés.                                                                                      | Liste au §5 bis.                                                                                         |
| S5  | Refus d'annuler flou ; fournées d'un SKU retiré.                                                       | Bacs fermés compris ; surplus hors compte (§D3, §5 bis).                                                 |
| S6  | Irréversibilité non dite.                                                                              | Point de non-retour au §5.                                                                               |
| S7  | Dette de journal élargie, non dite.                                                                    | Dite au §D7.                                                                                             |
| —   | Non vérifié : `FOR UPDATE` à travers Accelerate.                                                       | **Reste ouvert** : F1 le teste sur `dev`.                                                                |
