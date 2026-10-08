/** La carte « Mandats à la banque » d'une entité. */
export class GetMandateBankExportsQuery {
  constructor(readonly legalEntityId: string) {}
}

/** Le fichier d'un export, recalculé depuis ses mandats. */
export class ExportMandateBankFileQuery {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
  ) {}
}
