/** Retire une société de nos établissements : aucun essai ne la visera plus. */
export class WithdrawOwnEstablishmentCommand {
  constructor(
    readonly companyId: string,
    readonly staffUserId: string,
  ) {}
}
