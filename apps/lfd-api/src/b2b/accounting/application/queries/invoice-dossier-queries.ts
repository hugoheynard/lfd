/**
 * Les lectures du **dossier de facturation simulé** (plan
 * `simulateur-dossier-de-facturation.md`). Des lectures pures :
 * rien n'est émis, rien n'est prélevé.
 */

/** Les trois fichiers du dossier — un par sortie. */
export type InvoiceDossierSheet = "invoice" | "orders" | "gaps";

/** Le dossier d'un payeur pour un mois — le mois en cours si `month` est absent. */
export class GetInvoiceDossierQuery {
  constructor(
    readonly companyId: string,
    /** `AAAA-MM`, ou `undefined` pour le cycle en cours. */
    readonly month: string | undefined,
  ) {}
}

/** Une sortie du même dossier, en CSV. */
export class ExportInvoiceDossierQuery {
  constructor(
    readonly companyId: string,
    readonly month: string | undefined,
    readonly sheet: InvoiceDossierSheet,
  ) {}
}
