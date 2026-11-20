/** Les commandes à régler en boutique, du jour de retrait `from` au jour `to` compris. */
export class GetShopTillOrdersReportQuery {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}
}
