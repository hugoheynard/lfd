/** Où ces SKU se rangent, selon le mode du réglage du fournil (la route du rangement). */
export class GetProductionGroupingQuery {
  constructor(readonly skus: readonly string[]) {}
}
