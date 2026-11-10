/**
 * L'aperçu du départ incomplet d'une commande du comptoir — AVANT le geste
 * (lot C1b, plan `documentation/commandes/reliquat/reliquat.md`,
 * §2.2.1 et §2.2.4 — Hugo, 2026-11-03).
 */
export class GetCounterIncompleteHandoverQuery {
  constructor(readonly orderId: string) {}
}
