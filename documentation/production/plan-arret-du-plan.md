# Plan — l'arrêt du plan de production, automatique ou manuel

**Ouvert le 2026-10-06** · bâtis : A0 (`55b334f74`), A1 (`05b10dce6`), A2 (2026-10-06, commit suivant). (Hugo, après un mardi dont le plan n'avait pas été
arrêté la veille). Doc-first : rien de ce qui suit n'est bâti, sauf le
rattrapage (§1), en cours le même jour.

## 0. Ce qui existe (vérifié le 2026-10-06)

- **Un seul geste, manuel** : `POST /admin/production/batch/:date/close`
  (`production/http/production-day.controller.ts:179`), sous
  `@AdminSurface("production_plan")`. Le droit `production_plan:write` dit déjà
  « Arrêter la journée de production » (`packages/contracts/src/staff-resource-scopes.ts:157`).
- **La clôture** (`close-production-day.handler.ts`) : balaie les règlements
  en vol, charge la journée, et si elle n'est pas close fige le compte,
  publie `production.day_closed` (durable : commerce, livraison, colisage) et
  la liste à coliser. Rejouée sur une journée close, elle **republie** sans
  recalculer (`alreadyClosed`). Refus : journée vide
  (`ProductionDayEmptyError`). L'écriture verrouille la ligne (`FOR UPDATE`,
  `prisma-production-day.repository.ts:150`).
- **L'écran** : la bande « Arrêter le plan » du prévisionnel ne propose que
  la première journée **après aujourd'hui** (`dayToArrest`), d'où le mardi
  oublié.
- **Aucune tâche planifiée dans l'API** (vrai au 2026-10-06 avant A2 ; depuis A2, `admin/production/auto-close` est appelée par le cron `*/5`). Le seul réveil est le Worker
  (`apps/lfd-api/container/worker.ts`) : un cron `*/5` qui appelle des routes
  machine (`admin/outbox/sweep`, `admin/production/quality/sweep`…) sous
  `RecomputeGuard` et son jeton.
- **Aucun réglage de production** : ni table, ni page `production/reglages`.
- **L'heure de la maison** : `instantToLocal` (`packages/contracts/src/paris-time.ts:85`),
  `Europe/Paris`.
- **Les alertes staff** existent (`src/staff/notifications/`, cloche + push
  web), aucune n'est branchée sur la clôture.

## 1. Le rattrapage (en cours, 2026-10-06)

Si le plan d'**aujourd'hui** n'est pas arrêté et porte des commandes, la
bande le propose en premier, en alerte. Le geste du soir pour le lendemain
reste dessous. Un jour passé n'est pas proposé.

## 2. Le réglage

Dans **Production › Réglages** (page neuve) :

| Mode            | Ce qu'on règle                                  | Ce qui se passe                                                                                                     |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Automatique** | une heure d'arrêt (`HH:MM`, heure de la maison) | à cette heure, le serveur arrête le plan du **lendemain**                                                           |
| **Manuel**      | une heure d'alerte (`HH:MM`)                    | à partir de cette heure, la bande « Arrêter le plan » apparaît ; passé l'heure sans arrêt, la journée est en alerte |

Un seul réglage pour la maison (pas par point de retrait) : la clôture est
par journée, tous lieux confondus.

**Stockage** : une table `production.production_settings`, une ligne,
`close_mode` (`auto` | `manual`), `close_at` (`HH:MM`, en mode auto),
`alert_at` (`HH:MM`, en mode manuel). Valeur initiale : **`manual`, alerte à
20:00** (Hugo, 2026-10-06). Migration **additive**.

Un agrégat, pas un CRUD : il refuse un mode auto sans heure, une heure mal
formée, et garde l'historique de qui a changé quoi (journal).

## 3. L'arrêt automatique

- **Le réveil** : une route machine `POST admin/production/auto-close`
  (même porte que les balayages : `@Public()` + `RecomputeGuard`), appelée par
  le cron `*/5` du Worker. Pas de `@nestjs/schedule` : l'API est
  multi-instance et se réveille par ce cron.
- **Ce qu'elle fait** : lit le réglage ; en mode `auto`, si l'heure de la
  maison a dépassé `close_at` et que le plan du **lendemain** n'est pas
  arrêté, elle appelle la même `CloseProductionDayCommand`. Au plus cinq
  minutes de retard.
- **Plusieurs instances, plusieurs tours** : la clôture verrouille la ligne
  et ne fige qu'une journée encore ouverte. À vérifier au lot : que la relecture
  de `isClosed` se fait bien **sous** le verrou, sans quoi deux tours
  simultanés republieraient le fait. Une republication est sans danger
  (c'est le rattrapage prévu), mais le relevé doit dire « déjà arrêté ».
- **Auteur** : la clôture automatique est signée « automatique » dans le
  journal, pas par une personne.
- **Journée vide** (Hugo, 2026-10-06 : prévenir) : la clôture refuse le vide ;
  le tour automatique ne l'appelle pas, et envoie une notification staff
  « Rien à arrêter pour le <jour> : aucune commande » une fois par journée,
  aux mêmes destinataires que l'alerte (§4).
- **Arrêt anticipé** (Hugo, 2026-10-06) : en mode automatique, le bouton
  manuel reste, sous le nom « Arrêter le plan du <jour> maintenant (avant
  <close_at>) » ; arrêté à la main, le tour automatique trouve la journée close
  et ne fait rien.
- **Rattrapage automatique** : si le serveur était éteint à l'heure dite,
  le tour suivant arrête quand même le lendemain. Le plan du **jour même** non
  arrêté n'est jamais arrêté automatiquement (la fournée est déjà au four) :
  il reste au rattrapage manuel du §1.

## 4. L'alerte (mode manuel)

- Passé `alert_at` sans arrêt du plan du lendemain : une notification staff
  (cloche + push) aux personnes qui ont `production_count_stop:write`, une fois par
  journée. Envoyée par la même route machine.
- À l'écran : voir §5.

## 5. Le prévisionnel

| État de la colonne                                                   | Rendu                |
| -------------------------------------------------------------------- | -------------------- |
| Journée passée                                                       | grisée               |
| Journée à arrêter, heure d'alerte (ou d'arrêt) dépassée, pas arrêtée | surcouche **alerte** |
| Production du jour, plan arrêté                                      | surcouche **accent** |
| Autre                                                                | inchangé             |

Le contrat du prévisionnel gagne, par journée, l'état calculé côté serveur
(`past` / `overdue` / `closed` / `open`) : l'écran ne refait pas le calcul
d'heure.

## 6. Les droits

- **Arrêter le plan** : un droit neuf, **`production_count_stop`** (Hugo,
  2026-10-06 : « ça ne peut pas être le même droit pour une ligne du fournil
  et l'arrêt du compte de prod »). `write` = arrêter (soir, anticipé,
  rattrapage). Les routes `POST …/batch/:date/close` passent sous lui.
  `production_plan` garde la lecture du plan du soir ; son `write` ne porte
  plus l'arrêt — sa description est réécrite, et s'il ne porte plus rien, il
  est retiré du sélecteur à l'écran (sa valeur reste en base).
- 🔴 **Conséquence au déploiement** : tous les rôles qui arrêtent le plan
  aujourd'hui (`production_plan:write`) perdent le geste jusqu'au réglage à
  l'écran. La liste des rôles concernés se lit en production par Hugo
  (requête fournie au lot A1) ; le runbook du déploiement dit d'accorder
  `production_count_stop` AVANT 20:00 le jour même.
- L'alerte et le prévenu « rien à arrêter » vont aux personnes qui ont
  `production_count_stop:write`.
- **`production_settings`** (neuf) : `read` = voir le mode et les heures ;
  `write` = les changer. La migration **ajoute la ressource, n'accorde rien** :
  le droit se règle à l'écran (`/admin/staff-roles`) le jour du déploiement.
- La route machine n'a pas de droit staff : elle a le jeton du Worker.

## 7. Lots

1. **A1** — table + agrégat + routes lecture/écriture du réglage + droit
   `production_settings` + page Production › Réglages.
2. **A2** — route machine `auto-close` (arrêt auto + alerte) + appel depuis
   le Worker + journal.
3. **A3** — état par journée dans le prévisionnel + surcouches.

## 8. Décisions de Hugo (2026-10-06)

- **Q1** — départ : manuel, alerte à 20:00.
- **Q2** — mode auto, lendemain sans commande : prévenir (§3).
- **Q3** — droit neuf `production_count_stop` (§6).
- **Q4** — en mode auto, le bouton manuel reste, nommé « arrêt anticipé » (§3).

## 9. Contradiction (vitruve, 2026-10-06) et ce qu'elle change

**B1 — Double clôture (défaut EXISTANT, pas seulement de l'auto).** `load`
lit hors verrou (`prisma-production-day.repository.ts:32`), le `FOR UPDATE`
n'est pris qu'au `save` (l.146-150) : deux clôtures concurrentes (deux clics,
ou le cron contre un arrêt anticipé) ferment toutes les deux — deux
instantanés, deux `production.day_closed` « frais », deux listes à coliser.
Le JSDoc de `save` affirme le contraire. **Correctif, lot A0, avant tout le
reste** : la clôture charge la journée SOUS le verrou, dans la transaction
qui écrit ; la seconde trouve la journée close et prend le chemin
`reannounce`. Test de régression : deux clôtures concurrentes → une seule
fermeture.

**B2 — Journée vide et balayage des règlements.** Le tour automatique appelle
la vraie commande (le balayage tue les règlements en vol, sans quoi ils se
paieraient pour une journée que personne ne produit), mais **une seule fois
par journée visée** : une trace `production_auto_close_attempt(service_day)`
unique. Vide → notification « rien à arrêter », puis plus rien. Pas d'appel
Stripe toutes les cinq minutes.

**S3 — Heures limites de commande.** Elles existent déjà au commerce
(`src/b2b/order-cutoffs/`). Une `close_at` antérieure à l'heure limite du
lendemain tuerait des paiements légitimes et laisserait des commandes hors
plan. Proposition : la page Réglages montre l'heure limite la plus tardive,
et l'agrégat **refuse** une `close_at` antérieure (à confirmer, Q5).

**S4 — Minuit.** `close_at` est bornée à `12:00`–`23:55` (l'agrégat refuse
le reste). Si le tour de `close_at` est manqué et qu'on passe minuit, la
journée visée devient « aujourd'hui » : pas d'arrêt automatique (§3), mais
l'alerte du rattrapage part (notification + bande du §1).

**S5 — Jours sans production.** Il n'existe aucun calendrier des jours
fermés du fournil. Sans lui, chaque veille de jour fermé enverrait « rien à
arrêter ». Q6.

**S6 — Droit neuf.** `production_plan:write` ne porte que la route de
clôture (`production-day.controller.ts:179`) : il devient vide et sort du
sélecteur. `ROLE_GRANTS` (graine dev/e2e) reçoit `production_count_stop`
pour les rôles qui avaient `production_plan:write`, sans quoi démo et e2e
perdent l'arrêt. La fenêtre en production reste celle du §6 : réglage à
l'écran, avant 20:00, le jour du déploiement.

**S7 — Auteur.** Le tour automatique pose un acteur système nommé
(`system:auto-close`) dans le contexte de requête ; le journal l'écrit
« automatique ». À vérifier au lot : ce qu'une route `@Public` met
aujourd'hui dans le contexte.

**S8 — Une notification par journée.** Clé d'idempotence
`(type, journée)` sur `staff_notification.idempotency_key` (unique, existe :
`prisma/schema/public/staff.prisma:348`), audience par permission
`production_count_stop:write` (`prisma-audience-notifications.ts:18`).
Envoyée depuis `production` → `staff` (autorisé par la matrice).

**Lots revus** : **A0** double clôture · A1 réglage + droit + page · A2 tour
automatique + alertes · A3 prévisionnel.

**Q5** — refuser une heure d'arrêt automatique antérieure à l'heure limite de
commande du lendemain ? **Q6** — jours sans production : (a) ne prévenir « rien
à arrêter » que si le lendemain est un jour où l'on prend commande (d'après
les heures limites/jours de livraison existants), ou (b) un calendrier des
jours fermés du fournil dans Réglages ?

### Décisions de Hugo sur la contradiction (2026-10-06)

- **Q5** — oui : l'agrégat refuse une heure d'arrêt automatique antérieure à
  l'heure limite de commande du lendemain ; la page Réglages la montre.
- **Q6** — (b) : un calendrier des jours fermés du fournil dans Réglages ; la
  veille d'un jour fermé ne prévient pas « rien à arrêter ».
- **Q7** — un arrêt cliqué par erreur doit pouvoir repartir. Le retirage
  (`retake-production-day.handler.ts`) absorbe déjà les commandes arrivées
  après l'arrêt. En plus : « Rouvrir le plan », seulement tant que rien n'a
  commencé en aval (aucune fournée cochée, rien au colisage, aucune tournée
  partie ou retouchée), sous `production_count_stop` ; fait durable
  « plan rouvert » que commerce, livraison et colisage défont. Dernier lot (A4),
  à concevoir en détail avant d'être bâti.

- **`production_plan:write`** (Hugo, 2026-10-06, option 1) : laissé vide,
  décrit « N'ajoute rien ». Incohérence assumée : il reste proposé à l'écran
  des rôles sans rien garder. Le modèle des ressources en lecture seule est en
  TODO : [`droits-et-permissions/todo-ressources-en-lecture-seule.md`](../droits-et-permissions/todo-ressources-en-lecture-seule.md).

## A2 — bâti le 2026-10-06

Tour pur `apps/lfd-api/src/production/domain/services/auto-close-round.ts`, route machine
`admin/production/auto-close` appelée par le Worker, trace
`production.production_auto_close_attempt` (prise par `ON CONFLICT DO
NOTHING`), acteur `system/auto-close`, notifications
`production.plan_nothing_to_arrest` / `plan_not_arrested` /
`plan_today_not_arrested` (clé `notification:<type>:<jour>`). **Aucune
retentative** après un échec : l'alerte part avec la raison. **Ouvert** : une
tentative restée `pending` (processus mort entre la prise et l'issue) ne
déclenche ni retentative ni alerte (Q8).

**Q8** (Hugo, 2026-10-06) — bâti le 2026-10-06 : une tentative `pending`
depuis plus de quinze minutes (`STALLED_ATTEMPT_AFTER_MS`) déclenche une
alerte dédiée `production.plan_auto_close_stalled` (clé
`notification:<type>:<jour>`), sans retentative. Nature propre plutôt que
`plan_not_arrested` : la clé de celle-ci peut être déjà prise pour la journée
(alerte manuelle avant un passage en automatique).

## A3 — backend bâti le 2026-10-06

`ProductionForecastDay.state` (`past` / `closed` / `overdue` / `closedDay` /
`open`), calculé par `apps/lfd-api/src/production/domain/services/forecast-day-state.ts` à partir des
seuils du tour (`armed`, `attemptNeedsHand`, `todayNeedsCatchUp`). `closed`
reste. Déclencheurs `day_change` sur `production_closed_day` et
`production_auto_close_attempt` (migration
`20261006140000_le_previsionnel_suit_l_arret_du_plan`). Les surcouches de
l'écran restent à faire.
