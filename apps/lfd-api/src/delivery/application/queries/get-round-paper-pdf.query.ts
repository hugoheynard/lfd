/**
 * Le papier d'une tournée, en PDF. `canReadProcedures` : le droit
 * `delivery_procedures:read` du demandeur — sans lui, les étapes ne
 * s'impriment pas, comme la feuille de route les sert vides (DG-D8).
 */
export class GetRoundPaperPdfQuery {
  constructor(
    readonly roundId: string,
    readonly canReadProcedures: boolean,
  ) {}
}
