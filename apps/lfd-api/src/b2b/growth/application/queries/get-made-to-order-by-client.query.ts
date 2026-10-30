/** Le sur mesure par client, du jour `from` au jour `to` compris (lot R). */
export class GetMadeToOrderByClientQuery {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}
}
