# TODO — notifications e-mail

> **État au 2026-08-09** : le transport existe et est branché
> (`@lfd/mailer`, `MailerModule` global, deux gabarits d'alerte interne).
> **Aucun e-mail ne part encore** — il n'y a pas de point d'appel.
>
> Audit : [`../b2b/audit-flux-plateforme-admin.md`](../b2b/audit-flux-plateforme-admin.md) §P0-3.
> Jalon : [`../release-plan-2026-08.md`](../release-plan-2026-08.md) J2.

## Fait

- `@lfd/mailer` — Resend, mode à blanc sans clé, disjoncteur, primitives de
  rendu. Les gabarits sont un **paramètre de type** : le paquet ne connaît pas
  le vocabulaire des apps.
- `MailerModule` (global) + `AppConfig.mailerConfig()`.
- Deux gabarits : `staff.appointment-booked`, `staff.support-requested`.

## Reste — dans l'ordre

### 1. Les deux points d'appel

- **Rendez-vous pris** — `BookAppointmentHandler` a déjà tout en main (payload +
  id). L'envoi doit être **best-effort**, comme l'est déjà le journal : un
  fournisseur d'e-mail en panne ne doit **jamais** refuser une réservation.
- **Demande de contact déposée** — bloqué par un manque réel :
  `SupportRequestedEvent` ne porte que des identifiants (`supportRequestId`,
  `companyId`, `channel`). Il n'y a **pas** de quoi écrire l'e-mail (nom, motif,
  disponibilité, message). Deux options :
  - **a)** enrichir l'événement — simple, mais un événement de domaine gonflé
    pour les besoins d'un canal sortant ;
  - **b)** relire la demande depuis l'abonné, via le reader existant — le
    domaine reste maigre, au prix d'une lecture.
    **b) est préférable** : l'événement dit _ce qui s'est passé_, pas _ce qu'on
    veut afficher_.

### 2. Deux réglages, qui ne sont pas du code

> **2026-08-16** — la procédure de mise en service (domaine, DNS, les quatre
> réglages, les contrôles) vit maintenant dans
> [`../ops/mailer-resend.md`](../ops/mailer-resend.md). Deux trous de la chaîne
> de configuration y ont été fermés au passage : `MAILER_REPLY_TO` et
> `AUTH0_DB_CONNECTION` étaient transmis par le Worker mais **jamais posés** par
> le déploiement — branchés sur du vide. La CI compare désormais les trois
> listes de noms.

- **`MAILER_STAFF_INBOX`** — l'adresse de l'équipe commerciale. Prévue en
  configuration, **renseignée nulle part**. Sans elle, aucune alerte interne ne
  peut partir, et c'est volontaire (`null` ⇒ on n'envoie pas plutôt que
  d'envoyer au hasard).
- **Le domaine d'expédition doit être vérifié chez Resend** avant qu'un envoi
  aboutisse. Le défaut est `no-reply@lafoliedouce.fr` — à confirmer, et à
  vérifier côté fournisseur (DNS). C'est un délai externe : à lancer **tôt**,
  pas la veille du 17/08.

### 3. Ensuite seulement — les e-mails au client

Accusé de réception d'un rendez-vous, rappel J-1, confirmation de commande. Ils
supposent le domaine vérifié (point 2) et une décision produit sur ce qu'on
envoie, à qui, et comment on s'en désabonne. **Ne pas** les livrer avant les
alertes internes : un client qui reçoit une confirmation alors que personne à
LFC n'a été prévenu, c'est la pire des deux moitiés.

## La cloche du back-office — le sondage, et pourquoi pas de WebSocket

`StaffNotificationsStore` relance `GET /admin/notifications` **toutes les 60 s**,
et c'est délibéré : « une cloche n'est pas du temps réel ». Deux défauts s'y sont
glissés, du même genre tous les deux — un appel inconditionnel.

### a. Il sonne aussi quand personne ne regarde 🟠

Le `setInterval` démarre à la construction du magasin et tourne tant que l'app
est ouverte, **onglet en arrière-plan compris**. Un onglet laissé ouvert la
journée, c'est ~500 appels pour rien.

À faire : suspendre sur `document.hidden`, relire sur `visibilitychange`. Effet
de bord heureux — revenir sur l'onglet rafraîchit **instantanément**, ce qui est
le seul moment où la fraîcheur compte vraiment.

### b. Il sonne à une porte que deux rôles n'ont pas 🔴

Le contrôleur est `@AdminSurface("support")`, donc `support:read`. Dans
`ROLE_GRANTS`, **`comptabilite` et `dev` ne l'ont pas** : pour eux c'est un `403`
par minute, indéfiniment. Le magasin passe alors `failed` à vrai, et le panneau
affiche « le fil n'a pas pu être relu » — un message de panne pour un refus de
droit.

À faire : ne pas démarrer la boucle sans `permissions.can('support:read')`, et
distinguer « pas le droit » de « n'a pas pu ». Même famille que les trous du
socle d'autorisation front corrigés le 2026-08-14.

### c. Pourquoi pas un WebSocket — décidé, pas oublié

Le gain serait la **latence** (1 s au lieu de 60), pour un fil que personne ne
regarde en attendant. La charge n'est pas un argument : trois personnes au
back-office font trois requêtes par minute.

Le coût, sur cette plateforme, est réel. La primitive WebSocket de Cloudflare est
le **Durable Object** ; or le nôtre n'est qu'un routeur sans état vers le
container. Deux chemins, tous deux chers :

- terminer le WS **dans le container** — il hérite de l'instance unique tuée à
  chaque déploiement, sans drain (cf.
  [`todo-deploiement-en-exploitation.md`](todo-deploiement-en-exploitation.md)) ;
- faire du DO un **vrai acteur** qui tient les connexions — propre, mais c'est un
  chantier : lui faire remonter les écritures Postgres, gérer la
  resynchronisation.

Et dans les deux cas il faut **quand même** une relecture complète à la
reconnexion : on n'aurait pas remplacé le sondage, on l'aurait gardé en filet.

**Ce qui fera basculer la décision** : le premier écran qui demande du vrai temps
réel — le scan de retrait (le client présente son QR, le comptoir doit voir
l'état basculer), ou un suivi de commande côté client. Là, la latence devient
fonctionnelle, et un seul écran justifiera le chantier.

## Ce qu'on ne fait pas

Pas de file d'attente ni de relance automatique pour l'instant. Le disjoncteur
protège le fournisseur, l'appel est best-effort : un e-mail perdu est un e-mail
perdu, et c'est acceptable tant que la file du back-office reste la source de
vérité. Une file (BullMQ) devient nécessaire le jour où un e-mail au **client**
porte une obligation — une facture, une confirmation de paiement.
