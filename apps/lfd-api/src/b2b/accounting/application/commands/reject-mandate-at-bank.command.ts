/**
 * Le compte rendu d'import CENET d'un export DÉPOSÉ met ce mandat en erreur :
 * il redevient « à exporter », avec le motif recopié (doc
 * `prerequis-export-mandats.md`, Hugo 2026-10-23).
 */
export class RejectMandateAtBankCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly mandateId: string,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
