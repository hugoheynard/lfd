/** Appliquer « Proposer » d'un coup : les bacs proposés, remplis bac par bac (suite de K2b). */
export class ApplyPackingProposalCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly staffUserId: string,
  ) {}
}
