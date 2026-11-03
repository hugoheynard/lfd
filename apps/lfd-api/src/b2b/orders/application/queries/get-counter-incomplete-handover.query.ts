/**
 * L'aperçu du départ incomplet d'une commande du comptoir — AVANT le geste
 * (lot C1b, plan `documentation/comptoir/plan-depart-incomplet-au-comptoir.md`,
 * §4.1 et §4.4 — Hugo, 2026-11-03).
 */
export class GetCounterIncompleteHandoverQuery {
  constructor(readonly orderId: string) {}
}
