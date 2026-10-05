/**
 * Les lectures du **relevé de cycle** (plan `agregation-des-commandes`, A1).
 *
 * Des lectures pures : rien n'est clôturé, aucun lot n'est figé. Avant S4-0, le
 * relevé est recalculé à chaque lecture, et il le dit (`provisional`).
 */

/** Les derniers cycles proposés au sélecteur, le plus récent d'abord. */
export class ListStatementCyclesQuery {}

/** Le relevé d'une société pour un mois — le mois en cours si `month` est absent. */
export class GetCycleStatementQuery {
  constructor(
    readonly companyId: string,
    /** `AAAA-MM`, ou `undefined` pour le cycle en cours. */
    readonly month: string | undefined,
  ) {}
}

/** Le même relevé, en CSV : une ligne par commande. */
export class ExportCycleStatementQuery {
  constructor(
    readonly companyId: string,
    readonly month: string | undefined,
  ) {}
}
