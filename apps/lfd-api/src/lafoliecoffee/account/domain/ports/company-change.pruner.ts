/**
 * Combien de temps une trace du journal des comptes clients reste utile :
 * sept jours, la durée du journal des journées.
 */
export const COMPANY_CHANGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * **Balayer le journal des comptes clients** (`public.company_change`) — le
 * seul geste de code qui y écrive : ses lignes naissent des déclencheurs.
 */
export abstract class CompanyChangePruner {
  /** Retire les traces écrites avant cet instant ; rend combien. */
  abstract pruneBefore(instant: Date): Promise<number>;
}
