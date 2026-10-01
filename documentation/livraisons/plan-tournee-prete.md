# Prévenir le livreur que sa tournée est prête — lot PL5

> ⏸️ **Mis de côté par Hugo le 2026-10-01** : « pas de notif pour le moment,
> ça va nous dévier ». Le plan reste tel quel pour le jour où on le reprend ;
> le défaut de la poussée partagée (D2) existe, lui, dès aujourd'hui.

> 📐 **Plan, rien n'est bâti** (2026-10-01). Hugo : « je veux qu'il soit
> prévenu » — quand toute sa tournée est prête, sans avoir à rouvrir « Ma
> tournée ».
>
> Déplace une **frontière de sécurité** (qui voit quelle notification) :
> `vitruve` avant Hugo.

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
