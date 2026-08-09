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

## Ce qu'on ne fait pas

Pas de file d'attente ni de relance automatique pour l'instant. Le disjoncteur
protège le fournisseur, l'appel est best-effort : un e-mail perdu est un e-mail
perdu, et c'est acceptable tant que la file du back-office reste la source de
vérité. Une file (BullMQ) devient nécessaire le jour où un e-mail au **client**
porte une obligation — une facture, une confirmation de paiement.
