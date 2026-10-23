/**
 * Le compte rendu d'import CENET d'un export DÉPOSÉ met ce compte en erreur :
 * il redevient « à exporter », avec le motif recopié (doc
 * `prerequis-export-ribs.md` § 2.6, Hugo 2026-10-23).
 */
export class RejectBankAccountCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly bankAccountId: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
