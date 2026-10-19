# Demandes client — le dossier

> Ouvert le 2026-10-19 (Hugo) : tout ce qui porte sur ce que les clients nous
> écrivent — « Nous écrire », « Signaler un problème », les motifs réglés à
> l'écran, la boîte du back-office.

| Doc                                                  | État                 | Ce qu'il porte                                                                                                                                                |
| ---------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`demandes-clients.md`](demandes-clients.md)         | ✅ bâti (2026-10-09) | Doc d'état : l'agrégat `CustomerRequest` (`kind` `contact` \| `order_problem`), les motifs `RequestReason`, la carte de contact, les photos, l'anonymisation. |
| [`todo-demandes-client.md`](todo-demandes-client.md) | 🟠 ouvert            | Ce qui n'est pas couvert : rattacher une demande à un panier récurrent.                                                                                       |

**Ce qui n'est pas ici, et pourquoi.** La prise de rendez-vous commercial
([`../b2b/architecture-prise-de-rendez-vous.md`](../b2b/architecture-prise-de-rendez-vous.md))
reste dans `b2b/` : un rendez-vous est un agrégat de l'acquisition (créneau,
commercial, prospect), pas une demande reçue dans la boîte. Son sujet manquant
est suivi dans [`../todos/todo-commercial-acquisition.md`](../todos/todo-commercial-acquisition.md).
L'aide à l'activation (`SupportRequest`, `support.prisma`) n'a pas de doc
propre ; son rapatriement en type de demande est noté dans
[`demandes-clients.md`](demandes-clients.md) §5.
