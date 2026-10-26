# La livraison — chantiers non pris

Ce que la livraison sait devoir corriger et que personne n'a pris. Un point
pris se réduit ici à un renvoi vers son plan ou son commit (convention du
`CLAUDE.md`, §8 : un sujet qui a son dossier y garde ses TODO).

## Le journal perd des lignes

- **Constat (2026-10-26)** : en bâtissant la suppression d'une tournée, un fait
  `delivery_round.stop_removed` par arrêt ne laissait au journal que le premier.
  La clé d'idempotence d'un fait est `type:subjectId:traceId` : deux faits du
  même type sur le même sujet (la tournée) dans la même requête partagent la
  clé, et l'insertion `skipDuplicates` (`ON CONFLICT DO NOTHING`) avale le
  second **sans erreur**. Contourné ce jour-là par un fait unique pour le geste,
  `DeliveryRoundRemovedEvent`, qui porte la liste des commandes.
- **Fichiers** :
  - `apps/lfd-api/src/b2b/growth/domain/activity-event.ts` —
    `buildActivityEventRow`, qui construit la clé par défaut
    (`` `${input.type}:${input.subjectId}:${context.traceId}` ``) ;
  - `apps/lfd-api/src/b2b/growth/infrastructure/prisma-activity-recorder.ts` —
    l'écriture `skipDuplicates`, qui rend la collision muette ;
  - `apps/lfd-api/src/delivery/domain/events/delivery-round.events.ts` — le
    contournement (`DeliveryRoundRemovedEvent`, son JSDoc le dit).
- **Risque** : tout geste qui publie plusieurs faits de même type sur un même
  sujet dans une requête (`publishAllTraced`, une boucle de `publishTraced`)
  perd tous les faits sauf le premier, et rien ne le signale — ni erreur, ni
  test qui ne compte pas les lignes. Le journal est lu comme l'histoire.
- **Correction proposée** : que la clé inclue ce qui distingue les faits d'un
  même geste (par exemple la commande citée, ou un rang dans le lot), au lieu
  de compter sur chaque appelant pour s'en souvenir. Le test qui l'éprouve
  publie deux faits de même type et même sujet dans une trace, et compte deux
  lignes.
- **Non pris.**

## Retirer un arrêt dont un bac est chargé

- **Constat (2026-10-26)** : `remove-delivery-stop` retire l'arrêt sans
  regarder le chargement. Si un bac de sa commande est chargé, la ligne de
  chargement reste attachée à un arrêt retiré : le livreur partirait avec un
  bac qu'aucune feuille ne nomme. La suppression d'une tournée, elle, refuse
  ce cas depuis le même jour (`LoadedRoundRemovalError`, « déchargez d'abord
  les bacs »).
- **Fichiers** :
  - `apps/lfd-api/src/delivery/application/commands/remove-delivery-stop.handler.ts`
    — le geste, sans lecture du chargement ;
  - `apps/lfd-api/src/delivery/domain/entities/delivery-round.ts` — `remove()`,
    qui ne reçoit pas les arrêts chargés ;
  - le modèle à suivre : `delivery-round-removal.ts` (`removeRound`, qui reçoit
    `loadedStopIds`), `remove-delivery-round.handler.ts` (qui les lit par
    `LoadedStopsReader`) et `domain/errors/delivery-round-removal-errors.ts`.
- **Risque** : un bac physiquement dans le véhicule sans arrêt sur la feuille
  ni dans « Ma tournée » — livré nulle part, ou au mauvais client.
- **Correction proposée** : le même refus que la suppression de tournée,
  porté par l'agrégat : `remove()` reçoit les arrêts chargés et refuse par une
  `BusinessError` qui dit le geste de sortie (« Déchargez d'abord le bac de
  cette commande (Livraison → Chargement), puis retirez l'arrêt »).
- **Non pris.**
