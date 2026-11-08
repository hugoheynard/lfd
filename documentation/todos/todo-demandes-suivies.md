# Une demande entre deux blocs se suit

> Chantier noté le 2026-11-06 avec Hugo, pendant la revue de S2 du service
> d'e-mails (cas 5, [`plan-service-e-mails.md`](../mail/plan-service-e-mails.md)).
> **Rien n'est bâti.** On reste d'abord sur les e-mails.

## La règle proposée

Quand un bloc **demande** à un autre de faire quelque chose, l'appelant **peut**
toujours savoir où en est sa demande : un identifiant tout de suite, l'état plus
tard. Il ne l'**attend** pas — attendre recouplerait les deux blocs (réseau dans
la transaction, panne de l'un qui bloque l'autre).

Trois sortes de ports de canal, et une seule est concernée :

| Sorte   | Exemple                      | Ce qu'on garantit                                                                         |
| ------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| lecture | `OrderHandoverHistoryReader` | rien de plus : la réponse est la valeur rendue                                            |
| fait    | `production.day_closed`      | la livraison (boîte d'envoi), jamais une réponse — le publieur ne connaît pas ses abonnés |
| demande | `mail.send`, déclarer un bac | un identifiant de suivi, et une lecture ou un fait de son état                            |

## La porte envisagée

- Chaque port de canal se **déclare** lecture, fait ou demande (marqueur sur
  l'interface) ; un port non déclaré échoue. On ne devine pas la sorte.
- Une demande rend un identifiant de suivi, jamais `void`.
- Un tiers hors de chez nous (Resend, Stripe…) : chaque type d'événement reçu
  par webhook est rattaché à un état ; un événement non rattaché échoue.
- Les ports existants qui ne suivent pas la règle : dette comptée, qui ne peut
  que décroître.

## Première étape

Mesurer en mode rapport combien de ports seraient en dette, puis décider avec
Hugo.
