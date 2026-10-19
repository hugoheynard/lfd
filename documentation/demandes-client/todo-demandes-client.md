# TODO — demandes client

> Ouvert le 2026-10-19. Remplace l'ancien TODO des types de demande (sept. 2026),
> supprimé ce jour : il prévoyait un sujet `RequestTopic` sur `Appointment` et
> `SupportRequest`, que les demandes client n'ont jamais emprunté — elles passent
> par `CustomerRequest` ([`demandes-clients.md`](demandes-clients.md)). Le
> contrat des sujets (`RequestTopic`) et ses libellés, lus par aucune application
> (vérifié le 2026-10-19), ont été retirés.

## Rattacher une demande à un panier récurrent

**Le besoin.** Un client qui écrit au sujet de son panier récurrent (changer
la fréquence, sauter une échéance) ne peut pas désigner lequel : le commercial
doit le retrouver à la main.

**L'état (vérifié le 2026-10-19).** `CustomerRequest` ne rattache qu'une
commande (`orderId`, `apps/lfd-api/prisma/schema/public/contact.prisma`) ; aucune
colonne vers un abonnement. Le concept existe toujours : `Subscription`,
`SubscriptionOccurrence` (`prisma/schema/public/subscriptions.prisma`, statut
`active | paused`) et le contexte `apps/lfd-api/src/b2b/subscriptions/`.

**La piste.** Un `kind` de plus (cf. `demandes-clients.md`, « Ajouter un
type ») plutôt qu'une colonne de plus sur l'enveloppe : les détails propres au
type portent l'abonnement, comme `order_problem` porte la commande. Le lecteur
vérifie que l'abonnement appartient bien à l'auteur (mur `company_id`). Non
tranché ; à concevoir avant de bâtir.

## Ailleurs

- Le **sujet d'un rendez-vous** (aujourd'hui seule la famille `purpose`) :
  [`../todos/todo-commercial-acquisition.md`](../todos/todo-commercial-acquisition.md).
- Les types à venir (devis, rappel à l'activation) : `demandes-clients.md` §5.
