# TODO — l'annulation

> Ouvert le 2026-10-13. Ce qui reste à faire autour de l'annulation, et que
> personne n'a encore pris. L'état bâti est dans
> [`annulation-par-le-staff.md`](annulation-par-le-staff.md) et
> [`annulation-par-le-client.md`](annulation-par-le-client.md).

## La file du comptoir et les commandes annulées

**Décision du 2026-09-10, réaffirmée le 2026-10-13 :** la file du retrait
**garde** une commande annulée, marquée « annulée », pour que l'équipe sache
quoi dire au client qui se présente quand même (la masquer laisserait chercher
une commande « disparue »). L'e2e
`apps/lfd-api/test/production-batch.e2e-spec.ts` (« garde une commande ANNULÉE
dans la file ») le tient. Scanner le QR d'une commande annulée est refusé :
« Cette commande est annulée. » (`src/handover/domain/services/handover.ts`).

Le 2026-10-13, un correctif l'avait masquée par erreur (lecture trop rapide
d'une objection de `vitruve`) ; il a été retiré avant tout push, quand cette
e2e a rougi.

Reste :

- [ ] Vérifier **à l'écran** que la file du comptoir montre clairement une
      commande annulée (pastille, ligne grisée) et ce qu'il faut dire au client.
- [ ] Le TODO d'origine de cette note (le test du comptoir qui ne passait pas
      par la vraie annulation, une commande remise puis annulée qui disparaissait)
      tombe avec le correctif retiré : une commande annulée reste dans la file.
