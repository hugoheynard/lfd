/**
 * Abandonne un export des comptes que la banque a rejeté (doc
 * `prerequis-export-ribs.md` § 2.3) : il sort de « en vol », et ses comptes
 * redeviennent « à exporter ».
 */
export class AbandonAccountBankExportCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly staffUserId: string,
  ) {}
}
