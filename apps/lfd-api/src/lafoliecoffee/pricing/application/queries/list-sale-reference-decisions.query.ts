/**
 * « Quelles décisions tarifaires visent encore cette référence de vente ? »
 * (`plan-pro-voit-les-declinaisons.md`, L7) — posée par la fiche née d'un
 * détachement, sur l'ancienne référence.
 */
export class ListSaleReferenceDecisionsQuery {
  constructor(readonly saleReference: string) {}
}
