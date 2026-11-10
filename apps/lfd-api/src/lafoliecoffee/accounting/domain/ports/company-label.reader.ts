/**
 * Le nom d'usage d'une société cliente — l'enseigne, sinon la raison
 * sociale —, pour nommer le zip de « Mes factures » (P2). Port étroit : un
 * consommateur, une méthode.
 */
export abstract class CompanyLabelReader {
  /** `null` : société inconnue. */
  abstract labelOf(companyId: string): Promise<string | null>;
}
