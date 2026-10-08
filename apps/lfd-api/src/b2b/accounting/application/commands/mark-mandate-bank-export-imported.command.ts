/**
 * Dit que la banque a importé un export (plan § 2 bis-4). Marque l'EXPORT,
 * pas des mandats : c'est l'empreinte de ses lignes qui fait « déjà importé ».
 */
export class MarkMandateBankExportImportedCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly staffUserId: string,
  ) {}
}
