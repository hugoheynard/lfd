/**
 * Les lignes qu'un geste a touchées, relues seules
 * (`le-cache-du-back-office.md`, § 4.2).
 */
export class GetCatalogScreenRowsQuery {
  constructor(readonly skus: readonly string[]) {}
}
