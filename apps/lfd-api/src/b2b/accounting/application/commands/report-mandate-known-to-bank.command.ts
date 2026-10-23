/**
 * Le compte rendu d'import CENET d'un export DÉPOSÉ dit que la banque avait
 * déjà ce mandat (doc `prerequis-export-mandats.md`, Hugo 2026-10-23).
 */
export class ReportMandateKnownToBankCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly mandateId: string,
    readonly staffUserId: string,
  ) {}
}
