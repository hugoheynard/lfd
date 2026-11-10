/**
 * Retire une attestation « Retours contrôlés » fausse — par une ligne de
 * plus, jamais en effaçant (plan `plan-page-procedure-de-prelevement.md` § 1.2).
 */
export class WithdrawBankReturnCheckCommand {
  constructor(
    readonly legalEntityId: string,
    readonly day: string,
    readonly note: string,
    readonly staffUserId: string,
  ) {}
}
