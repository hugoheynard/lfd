# TODO — une commande épargnée à la clôture, puis refusée, reste pendante

**Ouvert le 2026-09-27**, trouvé par `vitruve` sur la conception du lot C de
la fidélité, ouvert à la demande de Hugo. Rien n'est pris.

## Le constat (vérifié par `vitruve` le 2026-09-27)

- À la clôture, `PendingSettlementSweepService.tryCancel` **épargne** une
  commande dont Stripe dit le paiement `in_progress`
  (`pending-settlement-sweep.service.ts`, vers les lignes 90-101).
- Si Stripe envoie ensuite `payment_failed`, la commande passe
  `placed` / `failed`, et plus rien ne la relit : le balayage ne lit qu'une
  journée (`prisma-unsettled-settlement.reader.ts`), celle qui est close.
- Seul un abandon par le client la fait sortir. Sinon, elle reste pendante
  pour toujours, hors du plan de production, sans cloche.

## Pourquoi c'est un problème

- La commande n'est ni produite ni annulée, et personne n'est prévenu.
- Avec le lot C de la fidélité, un bon peut y être **réservé** : il ne sera
  jamais libéré. Le lot C le signale à la cloche mais ne le libère pas —
  libérer une commande qui se reprend, c'est la double dépense (plan fidélité,
  D7 et §11 bis S4).

## Ce qu'il faudrait trancher

1. Un refus qui arrive **après** la clôture de son jour annule-t-il la commande
   (comme la clôture l'aurait fait), dans le handler du webhook ?
2. Ou un balayage de rattrapage relit-il les jours déjà clos ?
3. Le mail client : celui de la clôture (« pas abouti à temps pour la
   fournée ») convient-il ?

## Liens

- [`architecture-abandon-du-reglement.md`](architecture-abandon-du-reglement.md)
- [`../comptabilite/fidelite/plan-points-de-fidelite.md`](../comptabilite/fidelite/plan-points-de-fidelite.md), §11 bis
