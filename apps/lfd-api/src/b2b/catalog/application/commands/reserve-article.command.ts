/**
 * Réserve un article à une société (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a). Ses sites
 * en héritent tant que le principal est actif (Q3, Q8) — ce que le mur du
 * lot L1b lira.
 */
export class ReserveArticleCommand {
  constructor(
    readonly sku: string,
    readonly companyId: string,
    /** L'id de la fiche staff qui réserve. */
    readonly reservedBy: string,
  ) {}
}
