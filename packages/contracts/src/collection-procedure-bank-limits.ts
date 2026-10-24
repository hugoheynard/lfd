/**
 * Les plafonds de la convention d'émission, comparés au lot suivi de
 * l'onglet 3 (plan `plan-plafonds-de-la-banque.md`, PL2). Des
 * AVERTISSEMENTS : aucun ne ferme « Marquer déposé » (décision Q1 de Hugo,
 * 2026-10-24). Un plafond non renseigné n'est pas comparé — son constat est
 * absent, jamais « zéro ». Montants en centimes.
 */
export interface CollectionProcedureBankLimitsView {
  /** Le lot comparé — le lot suivi — et le schéma dont on lit les plafonds. */
  readonly batchId: string;
  readonly scheme: "CORE" | "B2B";
  /** Les lignes (un débiteur chacune) au-dessus du plafond unitaire, dans l'ordre des rangs. */
  readonly perDebit: readonly CollectionProcedureDebitOverLimitView[];
  /** Le total du lot au-dessus du plafond par remise ; `null` sinon. */
  readonly perRemittance: CollectionProcedureAmountOverLimitView | null;
  /**
   * Le cumul du mois au-dessus du plafond mensuel ; `null` sinon, ou si le lot
   * n'a pas d'échéance figée (lot d'avant le 2026-10-08).
   */
  readonly monthly: CollectionProcedureMonthlyOverLimitView | null;
}

/** Une ligne du lot au-dessus du plafond unitaire. */
export interface CollectionProcedureDebitOverLimitView {
  /** Le nom figé sur la ligne du lot. */
  readonly debtorName: string;
  /** Le rang de la ligne dans le fichier. */
  readonly rank: number;
  readonly amountCents: number;
  readonly limitCents: number;
}

/** Un montant au-dessus de son plafond. */
export interface CollectionProcedureAmountOverLimitView {
  readonly totalCents: number;
  readonly limitCents: number;
}

/** Le cumul du mois au-dessus du plafond mensuel. */
export interface CollectionProcedureMonthlyOverLimitView extends CollectionProcedureAmountOverLimitView {
  /**
   * `AAAA-MM` — le mois civil (Paris) de l'ÉCHÉANCE du lot. SUPPOSÉ en
   * attendant la banque (Q-B7) : elle pourrait compter au mois du dépôt.
   */
  readonly month: string;
  /** Les lots comptés, celui-ci compris. */
  readonly batchCount: number;
}
