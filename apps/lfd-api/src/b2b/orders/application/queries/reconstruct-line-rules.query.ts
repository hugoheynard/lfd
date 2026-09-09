/**
 * « Quelles autres décisions étaient en vigueur ce jour-là sur cet article ? »
 *
 * Le SKU identifie la ligne : une commande ne porte jamais deux lignes du même
 * article, la passation les fusionne.
 */
export class ReconstructLineRulesQuery {
  constructor(
    readonly orderId: string,
    readonly sku: string,
  ) {}
}
