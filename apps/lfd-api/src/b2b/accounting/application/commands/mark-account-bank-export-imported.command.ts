/**
 * Dit que la banque a importé un export des comptes (doc
 * `prerequis-export-ribs.md` § 2.3). Ses comptes ne ressortiront plus.
 */
export class MarkAccountBankExportImportedCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly staffUserId: string,
  ) {}
}
