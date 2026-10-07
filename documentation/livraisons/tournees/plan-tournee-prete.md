# Prévenir le livreur que sa tournée est prête — lot PL5

> 🗄️ **Plan du 2026-10-01, mis de côté le jour même — gardé pour l'histoire
> des décisions, ce n'est plus un état du code** (bandeau du 2026-10-07,
> audit du dossier `livraisons/` ; il remplace les deux du 2026-10-01).
>
> **Ce qu'il est** : le plan PL5, v2 après `vitruve` (2026-10-01) — prévenir
> le livreur quand toute sa tournée est prête, sans qu'il rouvre « Ma
> tournée » (Hugo : « je veux qu'il soit prévenu »). Hugo l'a mis de côté le
> même jour : « pas de notif pour le moment, ça va nous dévier ». Il déplace
> une frontière de sécurité (qui voit quelle notification) : `vitruve` avant
> Hugo.
>
> **Ce qu'il n'est plus** : une description de son socle. Le § 1 a changé
> **le jour même**, à 16 h 30 (`ca152989f`, pour « Arrêt à décider ») : une
> notice s'adresse désormais à un **droit** (`staff_notifications.audience`),
> le fil partagé et la poussée sont murés, la cloche est celle de tout staff
> connecté, et la livraison émet déjà trois sortes de notices. Le
> « défaut de la poussée partagée » que nommait l'ancien bandeau est corrigé.
> **Rien de PL5 proprement dit n'est bâti** : ni destinataire, ni calcul
> « tournée prête », ni déclencheurs, ni sonnerie. D1, D2 et D6 sont à
> reconcevoir au-dessus d'`audience`, qui adresse un droit, pas une personne.
>
> **Où lire l'état réel** : [`a-la-porte.md`](../livreur/a-la-porte.md) § 4 (« Prévenir
> (B5) ») pour la notice adressée par droit ;
> [`composition-automatique.md`](composition-automatique.md) pour les cloches
> du bureau ; les fichiers de la table ci-dessous, dont chaque cellule a été
> rouverte dans le code le 2026-10-07.

## Ce que chaque point est devenu — relevé du 2026-10-07

| #   | Ce que ce document décrit                                                                                                                                | Ce qui existe aujourd'hui                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Verdict                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | **La cloche, un seul fil partagé** : `StaffNotice` sans destinataire, `recent()` et `countUnread()` lisent tout (§ 1)                                    | `StaffNotice.audience` facultatif (`staff-notifier.ts`), colonne `staff_notifications.audience` (migration `20261001190100_les_notifications_par_droit`, `staff.prisma`). Le fil partagé ne voit que `audience IS NULL`, dans ses quatre requêtes (`prisma-staff-notifications.ts`) ; « mes notifications » lit `audience IN (mes droits)` (`prisma-audience-notifications.ts`), routes `admin/me/notifications` sous l'authentification seule (`my-staff-notifications.controller.ts`). e2e : `staff-notification-audience.e2e-spec.ts` | bâti autrement (par droit)                                       |
| 2   | **La poussée part à tous les abonnements** (`all()`, § 1)                                                                                                | `all()` n'existe plus (`notifications/domain/ports/staff-push.ts`) : une notice partagée part aux installations de qui tient encore `staff_notifications:read`, une notice d'audience à celles de qui tient le droit visé, résolu à l'envoi (`pushing-staff-notifier.ts`). `staffUserId` est une clé de routage                                                                                                                                                                                                                          | bâti autrement                                                   |
| 3   | **« La livraison n'émet rien »** ; tous les émetteurs sont dans `b2b/` (§ 1)                                                                             | La livraison émet trois notices d'audience : `delivery.plan_arrested` et `delivery.rounds_gap` vers `delivery_rounds:write` (`plan-arrested-bell.ts`, `ring-rounds-gap-bell.handler.ts`), `delivery.stop_decision` vers `delivery_decisions:write` (`stop-decision-opening.ts`). Le fournil aussi, vers `production_count_stop:write` (`plan-arrest-bell.ts`)                                                                                                                                                                            | **faux** depuis le 2026-10-01                                    |
| 4   | **Aucun port du canal commerce ne pousse vers la livraison** (§ 1) ; « la première fois… à vérifier contre la porte » (D4)                               | Ce sens existe depuis CA0 (2026-10-06) : `DeliveryOrderPlacedListener` (`delivery-order-placed.listener.ts`), déclaré et implémenté par la livraison, appelé par le commerce sur `order.placed` (`tell-delivery-order-placed.handler.ts`). Rien ne porte « prête » (`OrderReadyEvent`) ni l'annulation jusqu'à la livraison                                                                                                                                                                                                              | bâti pour un autre fait ; « prête » **toujours ouvert**          |
| 5   | **PL4 sait dire `readyStops` et `stopCount`** (§ 1)                                                                                                      | Toujours vrai (`delivery-my-round.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | bâti tel quel                                                    |
| 6   | **PL5-D1 — une notification a UN destinataire** : `recipientStaffId`, colonne `recipient_staff_id`, type `MyStaffNotificationView`                       | Non bâti. Le mécanisme bâti adresse un droit : tous ceux qui le tiennent voient la notice, et la lecture est commune (« le premier qui lit fait foi », `staff-notifier.ts`) ; « mes notifications » rend `StaffNotificationsSummary`, pas un type neuf                                                                                                                                                                                                                                                                                   | **toujours ouvert** — à reconcevoir au-dessus d'`audience`       |
| 7   | **PL5-D2 — la poussée suit le même mur, dans les deux sens** ; route d'abonnement « à moi »                                                              | Bâti pour un droit (ligne 2) ; s'abonner « à moi » : `admin/me/notifications/push` (`my-staff-push.controller.ts`), l'ancienne route reste sous `staff_notifications` (`admin-staff-push.controller.ts`). La poussée à **une** personne n'existe pas                                                                                                                                                                                                                                                                                     | bâti autrement ; la personne **toujours ouverte**                |
| 8   | **PL5-D3 — « tournée prête »**, un calcul partagé avec PL4 et le départ                                                                                  | Aucun calcul « tournée prête » n'existe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **toujours ouvert**                                              |
| 9   | **PL5-D4 — constater après commit** : `EvaluateRoundReadiness(roundId)` et ses déclencheurs, côté livraison et côté commerce                             | Ni la commande, ni ses déclencheurs. Le seul port commerce → livraison porte `order.placed` (ligne 4)                                                                                                                                                                                                                                                                                                                                                                                                                                    | **toujours ouvert**                                              |
| 10  | **PL5-D5 — une seule sonnerie par tournée et par livreur** (`delivery.round_ready:<roundId>:<driverStaffId>`)                                            | Non bâti. L'anti-doublon de la cloche existe — `idempotencyKey` tenue par une contrainte unique (`prisma-staff-notifications.ts`) — et les notices de la livraison s'en servent                                                                                                                                                                                                                                                                                                                                                          | **toujours ouvert**                                              |
| 11  | **PL5-D6 — le front** : cloche pour tout staff, fil partagé seulement avec `staff_notifications:read`, « activer les notifications » dans « Ma tournée » | Les deux premiers sont bâtis (`lfd-backoffice-frontend/src/app/app.html`, `staff-notifications.store.ts`). L'activation existe, mais sur la page « Obtenir l'app mobile » (`/app-mobile`, `push-notifications.service.ts`, route `admin/me/notifications/push`), pas dans « Ma tournée »                                                                                                                                                                                                                                                 | bâti autrement ; le bouton de « Ma tournée » **toujours ouvert** |
| 12  | **Le lien de la notice** : `/livraison/ma-tournee` (D5)                                                                                                  | « Ma tournée » vit sous `/coursier` depuis le 2026-10-03 ; l'ancienne adresse redirige (`lfd-backoffice-frontend/src/app/app.routes.ts`)                                                                                                                                                                                                                                                                                                                                                                                                 | bâti autrement                                                   |
| 13  | **Tranché par Hugo le 2026-10-01** : toute la tournée, une notification par tournée (§ 4)                                                                | Toujours valable ; rien n'est bâti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | tranché ; **toujours ouvert**                                    |

Le texte qui suit est le plan du 2026-10-01, inchangé.

---

## 1. Ce qui existe (relu le 2026-10-01)

- **La cloche** (`src/staff/notifications/`) est **un seul fil partagé** :
  `StaffNotice` n'a pas de destinataire, `recent()` et `countUnread()` lisent
  toutes les lignes, la lecture est commune (« le premier lecteur fait foi »),
  et la surface est gardée par `staff_notifications`.
- **La poussée téléphone** (`PushingStaffNotifier`) envoie à **tous** les
  abonnements (`StaffPushSubscriptions.all()`) ; le `staffUserId` d'un
  abonnement n'est qu'une trace.
- **Tous les émetteurs sont dans `b2b/`** (paiements, fidélité, alertes,
  commandes). La livraison n'émet rien.
- **« Prête »** : le commerce publie `OrderReadyEvent`
  (`mark-order-ready.handler.ts`). Le canal `delivery/channels/commerce/` ne
  porte que des **lectures** que le commerce implémente ; aucune ne pousse
  vers la livraison.
- **PL4** sait déjà dire, pour une tournée, `readyStops` / `stopCount` et les
  bacs déclarés par arrêt.

Conséquence : donner `staff_notifications` au livreur lui montrerait les
alertes de comptes et de paiements de tout le monde. Il faut une notification
**adressée**.

## 2. Décisions proposées (v2, après `vitruve` le 2026-10-01)

### PL5-D1 — Une notification peut avoir UN destinataire

`StaffNotice` gagne `recipientStaffId?: string` (fiche staff, jamais un `sub`).
Colonne additive `recipient_staff_id text null` sur `staff_notifications`, et
un index sur `(recipient_staff_id, read_at)`.

- **Sans destinataire** : le fil partagé, inchangé pour ceux qui l'ont.
- **Avec destinataire** : visible **par lui seul**, quel que soit son rôle.
- **Le mur est dans chaque requête du fil partagé** : `recent`, `countUnread`,
  `markAllRead` **et `markRead(id)`** portent `recipient_staff_id IS NULL`. Un
  admin ne peut ni lire ni marquer lue, par son id, la notice d'un livreur.
- **Les routes « mes notifications »** (`GET admin/me/notifications`, son
  compteur, « marquer lu », « tout marquer lu ») portent
  `recipient_staff_id = moi` dans chaque `where`. Gardées par
  l'**authentification staff seule**. La lecture d'une notice adressée est
  celle de son unique destinataire : `readAt`/`readBy` gardent leur sens.
- **Contrat** : un type neuf `MyStaffNotificationView` (sans `readByName`,
  inutile quand on est seul lecteur). `StaffNotificationView`, servi au front
  en ligne, ne change pas.

### PL5-D2 — La poussée suit le même mur, dans les DEUX sens

🔴 Trouvé par `vitruve` : aujourd'hui la poussée part à
`subscriptions.all()`. Le jour où un livreur abonne son téléphone, il
recevrait **toutes** les alertes partagées.

- Une notice **partagée** ne part qu'aux abonnements dont le
  `staff_user_id` a **encore** `staff_notifications:read` (résolu au moment
  de l'envoi, par le port d'accès du socle). Ça corrige aussi le cas
  d'aujourd'hui : quelqu'un qui perd le droit continuait de recevoir.
- Une notice **adressée** ne part qu'aux abonnements de son destinataire.
- `staff_user_id` devient une **clé de routage** ; son JSDoc le dit. Un
  appareil partagé reçoit pour son **dernier** abonné (`upsert` sur
  `endpoint`) : assumé.
- **S'abonner** : une route `admin/me/notifications/push` gardée par
  l'authentification seule (aujourd'hui `admin/notifications/push` exige
  `staff_notifications`, ce qui refuserait le livreur). L'ancienne reste.

### PL5-D3 — « Tournée prête », la définition

Une tournée **non partie**, **avec un livreur affecté**, est prête quand
**chaque arrêt vivant** a sa commande `ready`, au moins un bac déclaré non
annulé, et aucun bac « à refaire ». Le calcul est celui de PL4
(`readyStops`) et de la préparation au départ, **partagé** — pas une
troisième version.

### PL5-D4 — Constater APRÈS commit, sur un état relu

🔴 Trouvé par `vitruve` : évaluer dans la transaction du geste perd la
sonnerie quand deux gestes se croisent (aucun ne voit l'écriture de l'autre).

- L'évaluation se fait **après commit**, en relisant l'état **commité** de la
  tournée, dans une commande `EvaluateRoundReadiness(roundId)`. Deux gestes
  concurrents lancent deux évaluations ; la seconde voit les deux écritures.
  L'idempotence (D5) empêche la double sonnerie.
- **Les gestes qui la déclenchent** — tous ceux qui peuvent faire passer une
  tournée à « prête » :
  - côté livraison : bac déclaré, bac annulé, livreur affecté ou réaffecté,
    arrêt retiré, tournée réordonnée (ce qui répare un « à refaire ») ;
  - côté commerce : commande **prête**, commande **annulée** (elle peut
    retirer le dernier arrêt non prêt).
- **Le passage commerce → livraison** : un handler b2b sur `OrderReadyEvent`
  (et l'annulation) appelle un port que la livraison **déclare** dans
  `delivery/channels/commerce/` et **implémente hors du canal**. C'est la
  première fois qu'un port de ce canal va dans ce sens : à vérifier contre
  `lint:context-boundaries` avant de bâtir. Pour une commande, le port trouve
  la tournée.
- **L'échec ne se perd pas en silence** : l'évaluation est suivie
  (`BackgroundWork.track`), et son échec est journalisé avec la tournée.
  « Ma tournée » reste la vérité : la sonnerie est un confort, l'écran
  ne dépend pas d'elle.

### PL5-D5 — Une seule sonnerie par tournée et par livreur

`idempotencyKey = delivery.round_ready:<roundId>:<driverStaffId>`.
**Délibéré** : une tournée qui redevient incomplète puis prête ne sonne pas
deux fois, et un livreur retiré puis remis n'est pas reprévenu. Une
**réaffectation** à un autre livreur le prévient lui.

Texte : sujet « Ta tournée est prête », corps « <nom de la tournée> — n
arrêts, n bacs », lien `/livraison/ma-tournee`. Sans clé de poussée
configurée, la notice est écrite et visible dans la cloche ; rien ne vibre.

### PL5-D6 — Le front

🔴 Trouvé par `vitruve` : la cloche du front est gardée par
`b2b_support:read` (`app.html`), pas par `staff_notifications`.

- La cloche s'affiche pour **tout staff connecté** et lit « mes
  notifications ».
- Le fil partagé n'est appelé **que** si l'on a `staff_notifications:read`
  (sans quoi l'appel prend 403 en boucle, cf. le commentaire de `app.html`).
  Le garde `b2b_support:read` est remplacé par ce droit-là.
- « Ma tournée » propose d'**activer les notifications** du téléphone, par la
  route d'abonnement neuve.

## 3. Lot

**PL5** — migration additive (colonne + index), cloche (port, adaptateur,
mur sur les quatre lectures/écritures du fil partagé, routes « mes
notifications »), poussée murée dans les deux sens et route d'abonnement,
calcul « prête » partagé, `EvaluateRoundReadiness` après commit et ses
déclencheurs, port commerce → livraison, front (cloche, bouton
d'activation), e2e :

- le livreur est prévenu au dernier bac déclaré, à la dernière commande
  prête, et à l'affectation d'une tournée déjà prête ; une seule fois ;
- deux déclarations concurrentes sur deux arrêts : prévenu quand même ;
- un autre livreur, un commercial, l'admin **ne voient pas** la notice
  adressée, ni dans le fil, ni dans le compteur, ni par `markRead(id)` ;
- le livreur ne voit **rien** du fil partagé, et ne **reçoit** aucune poussée
  partagée ;
- la poussée adressée ne part qu'à ses abonnements.

## 4. Tranché par Hugo le 2026-10-01

1. On prévient quand **toute la tournée** est prête, pas à chaque arrêt.
2. Un livreur avec deux tournées le même jour reçoit **une notification par
   tournée** (la clé d'idempotence porte le `roundId`).
