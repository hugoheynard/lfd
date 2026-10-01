# « Votre livraison est en route » — lot PL3

> 📐 **Plan** (2026-10-01). Hugo, étape 5 du
> [parcours du livreur](parcours-du-livreur.md) : « oui, "votre livraison est
> en route" au départ ». Ni argent, ni migration de données, ni frontière de
> sécurité : pas de `vitruve`, affirmations relues dans le code le jour même.

## 1. Ce qui existe (relu le 2026-10-01)

- Le départ publie `DeliveryRoundDepartedEvent`
  (`delivery/domain/events/delivery-loading.events.ts`) ; il fige l'ordre et
  le point GPS de chaque arrêt.
- Le commerce envoie déjà « votre commande est prête »
  (`b2b/orders/application/handlers/send-order-ready-mail.handler.ts`) : un
  abonné suivi par `BackgroundWork`, une clé d'idempotence déterministe par
  commande, un service d'envoi (`order-ready-mail.service.ts`).
- Le canal `delivery/channels/commerce/` : la livraison **déclare**, le
  commerce **implémente** (huit ports, tous des lectures).
- Le contact de livraison n'a pas d'e-mail (L6-C13).

## 2. Décisions

### PL3-D1 — La livraison annonce, le commerce écrit au client

Un message au client vit au commerce (L6-C12). La livraison déclare dans son
canal un port **`DeliveryDepartureAnnouncer`** —
`announceDeparture({ roundId, departedAt, orderIds })` — que le commerce
implémente. C'est le sens habituel du canal (la livraison déclare, le
commerce implémente) ; seule nouveauté : c'est une **annonce**, pas une
lecture. La livraison ne connaît ni courriel, ni client.

### PL3-D2 — Après commit, jamais dans la transaction du départ

Un abonné **de la livraison** à `DeliveryRoundDepartedEvent` appelle le port,
suivi par `BackgroundWork` (comme `SendOrderReadyMail`). Un départ refusé ou
annulé n'écrit à personne ; un courriel qui échoue ne fait pas échouer le
départ, et l'échec est journalisé.

### PL3-D3 — Un courriel par commande, une seule fois

- Un courriel **par commande** de la tournée (une commande = un arrêt), au
  **compte qui a commandé** tant que le contact de livraison n'a pas d'e-mail
  (L6-C13).
- Clé d'idempotence `delivery.en_route:<orderId>` : un départ rejoué ne fait
  pas partir un second message.
- Pas d'envoi pour une commande **annulée** ou **déjà retirée** au moment de
  l'envoi.

### PL3-D4 — Le contenu

Sujet « Votre livraison est en route ». Corps : la référence de la commande,
l'adresse de livraison, « votre livreur est parti, il arrive dans la
journée ». **Pas d'heure estimée** : on n'a pas d'estimation fiable par
arrêt aujourd'hui, et une heure fausse coûte plus qu'aucune heure. Pas de
nom ni de téléphone du livreur. Gabarit dans `packages/mailer`, à côté de
« votre commande est prête », même habillage.

## 3. Lot

**PL3** — port dans le canal, abonné de la livraison, implémentation au
commerce, gabarit, tests (domaine du gabarit, handlers à ports doublés), e2e :
le départ d'une tournée de deux commandes rend deux courriels (le transport
de test les capture), une commande annulée n'en reçoit pas, un départ rejoué
n'en rend pas de second.

## 4. Bâti le 2026-10-01 — écarts

- **« Après commit » n'est tenu qu'à moitié.** `DeliveryRoundDepartedEvent` est
  publié **dans** l'unité de travail du départ, et le bus appelle l'abonné de
  façon synchrone. L'abonné sort de la transaction (`outsideTransaction()`),
  mais si la validation échouait après la publication, le courriel partirait
  pour un départ qui n'a pas eu lieu. Le fermer demande un vrai `afterCommit`
  dans l'unité de travail : décision de plateforme, la même que le lot B
  d'« À la porte » attend.
- **Le gabarit vit dans l'app** (`platform/mailer/delivery-en-route-mail.ts`),
  pas dans `packages/mailer`, qui n'en porte aucun : le plan se trompait.
- **Une commande annulée** fait déjà refuser le départ
  (`DepartureOrderCancelledError`) : l'e2e prouve « départ refusé, aucun
  courriel » ; le filtre au moment de l'envoi est couvert en unitaire.
