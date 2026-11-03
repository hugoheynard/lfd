# TODO — les statuts du comptoir, et la Production sous son propre droit

> Ouvert le 2026-09-25, **mis en suspens par Hugo** le même jour (« met ça en
> suspend, note en todo »). Rien n'est commencé.

## Le constat (vérifié le 2026-09-25)

- Le rôle `comptoir` (`82846b1f3`) voit l'espace **Production** : l'entrée du
  menu et la route ne demandent que `b2b_orders:read`, qu'il a.
- 🔴 Masquer l'entrée ne suffirait pas : les routes serveur du fournil
  (`production-day`, `production-worksheet`, `production-packing`) et du
  retrait (`handover`) sont toutes en `@AdminSurface("b2b_orders")`. Le
  comptoir peut les appeler directement.
- La file de retrait affiche `Attendue · Prête · Retirée · Annulée`
  (`handover-shop/handover-queue.ts`, `stateLabel`). « Attendue » mêle la
  commande pas commencée et celle qu'on est en train de coliser.
- Côté commande, « colisée » **est** « prête » : le scan de colisage écrit
  `ready`. Le colisage partiel n'existe que dans le schéma `production`
  (`ProductionOrderLine.packedAt`). La cuisson, elle, n'est suivie que par
  produit, jamais par commande.

## Ce que Hugo a demandé

« comptoir doit avoir des statuts : en attente de la prod, en attente de
colisage » — et ne plus voir la Production.

## La proposition (non validée)

1. **Statuts de la file** : En attente de production (rien au bac) · En cours
   de colisage (une partie des lignes au bac) · Prête · Retirée · Annulée. La
   Production dirait au retrait combien de lignes d'une commande sont au bac,
   par une lecture ajoutée au canal existant `production/channels/handover/`.
2. **Une ressource `b2b_production`** qui garde les trois vues et les routes
   serveur du fournil, non accordée au `comptoir`. Migration par CONTENU des
   grants et des écarts (motif `20260926100100_le_comptoir_est_accorde`) :
   quiconque lit aujourd'hui `b2b_orders` la reçoit. `vitruve` d'office
   (frontière de sécurité).

## Questions ouvertes à Hugo

- « En attente de colisage » : colisage **commencé** (ce que la donnée sait
  dire), ou commande **cuite** qui attend le colisage (ce qui demanderait de
  marquer la cuisson par commande, inexistant) ?
- Le nom `b2b_production`, et à quels rôles il revient d'office.
