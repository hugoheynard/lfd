/**
 * Les lignes qu'un geste a touchées, relues seules
 * (`plan-catalogue-du-back-office.md`, § 3.2).
 */
export class GetCatalogScreenRowsQuery {
  constructor(readonly skus: readonly string[]) {}
}
