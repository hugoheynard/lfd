/**
 * Les lectures du **relevé de cycle** (plan `agregation-des-commandes`, A1).
 *
 * Des lectures pures : rien n'est clôturé, aucun lot n'est figé. Avant S4-0, le
 * relevé est recalculé à chaque lecture, et il le dit (`provisional`).
 */

/** Les dernières périodes proposées au sélecteur, la plus récente d'abord. */
export class ListStatementCyclesQuery {}

/** Le relevé d'une société pour une période — celle en cours si `periodClosesAt` est absent. */
export class GetCycleStatementQuery {
  constructor(
    readonly companyId: string,
    /** ISO — la clôture de la période, ou `undefined` pour la période en cours. */
    readonly periodClosesAt: string | undefined,
  ) {}
}

/** Le même relevé, en CSV : une ligne par commande. */
export class ExportCycleStatementQuery {
  constructor(
    readonly companyId: string,
    readonly periodClosesAt: string | undefined,
  ) {}
}
