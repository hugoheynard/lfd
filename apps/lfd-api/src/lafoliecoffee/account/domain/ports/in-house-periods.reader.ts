/** Une période « maison » : `withdrawnAt` nul, elle court encore. */
export interface InHousePeriod {
  readonly declaredAt: Date;
  readonly withdrawnAt: Date | null;
}

/**
 * **Lecture publiée** des périodes « maison » d'un payeur
 * (`restaurants-maison.md`), de la plus ancienne à la plus
 * récente : le récapitulatif des BL en déduit les mois manqués.
 */
export abstract class InHousePeriodsReader {
  abstract periodsOf(payerId: string): Promise<readonly InHousePeriod[]>;
}
