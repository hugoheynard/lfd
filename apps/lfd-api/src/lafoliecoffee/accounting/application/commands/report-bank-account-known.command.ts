/**
 * Le compte rendu d'import CENET d'un export DÉPOSÉ dit que la banque avait
 * déjà ce compte (doc `prerequis-export-ribs.md` § 2.6, Hugo 2026-10-23).
 */
export class ReportBankAccountKnownCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly bankAccountId: string,
    readonly staffUserId: string,
  ) {}
}
