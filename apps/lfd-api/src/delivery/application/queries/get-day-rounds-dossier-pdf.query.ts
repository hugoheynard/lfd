/**
 * Le dossier des tournées d'un jour (`AAAA-MM-JJ`), en PDF.
 * `canReadProcedures` : le droit `delivery_procedures:read` du demandeur —
 * sans lui, les feuilles partent sans étapes, comme `round.pdf` (DG-D8).
 */
export class GetDayRoundsDossierPdfQuery {
  constructor(
    readonly day: string,
    readonly canReadProcedures: boolean,
  ) {}
}
