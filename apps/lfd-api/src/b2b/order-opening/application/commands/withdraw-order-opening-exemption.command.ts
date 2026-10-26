/** Retirer une exemption : elle est archivée, pas effacée. Acte **staff**. */
export class WithdrawOrderOpeningExemptionCommand {
  constructor(
    readonly exemptionId: string,
    readonly staffUserId: string,
  ) {}
}
