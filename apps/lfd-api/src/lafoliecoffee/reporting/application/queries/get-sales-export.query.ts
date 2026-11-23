/**
 * **L'export des ventes d'une période** — jours de passation à Paris, bornes
 * incluses (`AAAA-MM-JJ`), 31 jours au plus ; la période est validée par
 * `SalesPeriod` dans le handler, pas ici.
 */
export class GetSalesExportQuery {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}
}
