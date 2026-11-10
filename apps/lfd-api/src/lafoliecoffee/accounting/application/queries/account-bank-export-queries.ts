/** La carte « Comptes à la banque » d'une entité. */
export class GetAccountBankExportsQuery {
  constructor(readonly legalEntityId: string) {}
}

/** Le fichier d'un export des comptes, recalculé depuis ses comptes. */
export class ExportAccountBankFileQuery {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
  ) {}
}
