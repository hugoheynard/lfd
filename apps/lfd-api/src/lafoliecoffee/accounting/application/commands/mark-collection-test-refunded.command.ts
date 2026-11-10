/** « Marqué remboursé » (plan `plan-prelevement-d-essai.md`, Q4). */
export class MarkCollectionTestRefundedCommand {
  constructor(
    readonly testId: string,
    /** `AAAA-MM-JJ` — le jour du virement rendu à l'établissement. */
    readonly refundedOn: string,
    readonly staffUserId: string,
  ) {}
}
