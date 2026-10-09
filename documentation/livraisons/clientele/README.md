# La livraison côté client

> Sous-dossier de [`livraisons/`](../README.md), rangé le 2026-10-07 (Hugo).
> Les états ci-dessous sont ceux que chaque document déclare en tête.

À qui la livraison est proposée (pros, particuliers), la procédure de livraison d'une adresse, et la livraison accordée avant l'activation.

| Doc                                                                                          | État et sujet                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`plan-procedure-de-livraison.md`](plan-procedure-de-livraison.md)                           | ✅ bâti, reste la vignette — La procédure d'une adresse : étapes ordonnées avec titre, texte et photo légère, écrites par le client ou le staff ; droit `delivery_procedures` ; écritures murées sur la société (2026-10-07). |
| [`plan-remise-et-livraison-par-clientele.md`](plan-remise-et-livraison-par-clientele.md)     | ✅ lots A, B, C bâtis — Qui a droit à la livraison (B2B / B2C), le réglage « Livraison », la clé `publicDelivery` fermée par défaut, l'application au devis et à la commande ; la boutique relit le réglage (2026-10-07).     |
| [`todo-livraison-accordee-avant-activation.md`](todo-livraison-accordee-avant-activation.md) | 🟡 rien de bâti — Le commercial doit pouvoir accorder la livraison à une société encore en attente ; la dérogation devra aussi lever `publicDelivery`.                                                                        |
| [`plan-retrait-slots.md`](plan-retrait-slots.md)                                             | ✅ bâti le 2026-10-07                                                                                                                                                                                                         | Retirer l'ancien champ `slots` des consignes : migration qui donne une liste de créneaux à chaque adresse (8 en production), puis le code ne lit plus que `slotList` ; contredit par `vitruve` (2026-10-07). |

## Ce qui fait foi

- **À qui la livraison est proposée** : `plan-remise-et-livraison-par-clientele.md`,
  lots A, B, C bâtis. La clé `publicDelivery`, qui doublait la case « B2C »
  pour les particuliers, est retirée le 2026-10-09 : la case « B2C » de
  « Livraison » est la seule porte, au devis comme aux deux passations.
- **La procédure d'une adresse** : `plan-procedure-de-livraison.md`, bâtie ;
  reste la vignette.
- **Ce qui reste** : la livraison accordée avant l'activation d'un compte
  (`todo-livraison-accordee-avant-activation.md`), rien de bâti.

Les autres thèmes du dossier, et les documents qui touchent la livraison sans
en être le sujet, sont listés dans l'[index du dossier](../README.md).
