# La livraison — de l'adresse au pas de la porte

**Rassemblé le 2026-09-29** à la demande de Hugo : « on a une grosse pièce qui
nous manque c'est la livraison ». Ce dossier regroupe ce qui était dispersé dans
`b2b/`, `todos/` et `handover-delivery/`. Aucun texte n'a été réécrit : les
documents sont déplacés tels quels, et leurs renvois repointés.

> ⚠️ Ce README est un **index**, pas une synthèse vérifiée. Les états ci-dessous
> sont ceux que chaque document déclare en tête ; ils n'ont pas été rouverts
> contre le code le 2026-09-29.

## Ce qui existe

| Doc                                                                                          | État déclaré          | De quoi ça parle                                                                                                            |
| -------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`plan-remise-et-livraison-par-clientele.md`](plan-remise-et-livraison-par-clientele.md)     | 🟡 lots A, B, C bâtis | Qui a droit à la livraison (B2B / B2C), le réglage « Livraison » du back-office, son application au devis et à la commande. |
| [`plan-procedure-de-livraison.md`](plan-procedure-de-livraison.md)                           | 🟡                    | La procédure d'une adresse : étapes ordonnées avec titre, texte et photo légère, écrites par le client ou le staff.         |
| [`todo-etrangetes-procedure-de-livraison.md`](todo-etrangetes-procedure-de-livraison.md)     | 🟡 rien de corrigé    | Ce que le filet de tests de la procédure a figé et qui cloche.                                                              |
| [`todo-livraison-accordee-avant-activation.md`](todo-livraison-accordee-avant-activation.md) | 🟡 rien de bâti       | Le commercial doit pouvoir accorder la livraison à une société encore en attente.                                           |

## Ce qui est conçu, sans une ligne

| Doc                                                                                  | État déclaré                   | De quoi ça parle                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`conception-retrait-en-livraison.md`](conception-retrait-en-livraison.md)           | 📐 v1 contredite par `vitruve` | Le retrait (le geste) chez le client : le code qui n'atteint pas la personne qui réceptionne, la réconciliation au chargement, la tentative ratée. Huit questions ouvertes. |
| [`architecture-road-livraison-tournees.md`](architecture-road-livraison-tournees.md) | 📐 note du 2026-08-06          | ROAD, l'application des livreurs et des tournées. Antérieure au bloc `handover` : à relire à la lumière de la conception ci-dessus.                                         |

## Ailleurs, et laissé où il est

Ces documents touchent la livraison sans en être le sujet. Ils restent dans le
dossier de leur sujet :

- [`../order/todo-tva-des-frais-de-port.md`](../order/todo-tva-des-frais-de-port.md) : la TVA des frais de livraison. Reste dans `order/`, qui garde les TODO de la commande (règle du 2026-09-17).
- [`../todos/todo-colisage-tri-par-echeance.md`](../todos/todo-colisage-tri-par-echeance.md) : trier le colisage selon le départ du véhicule.
- [`../order/architecture-bon-de-commande.md`](../order/architecture-bon-de-commande.md) : il n'y a pas de « bon de livraison », une seule pièce qui porte un mode d'acheminement.
- [`../order/plan-creneaux-de-retrait.md`](../order/plan-creneaux-de-retrait.md) et [`../order/architecture-heure-limite-de-commande.md`](../order/architecture-heure-limite-de-commande.md) : les créneaux et l'heure limite, qui s'appliquent aussi aux livraisons.
