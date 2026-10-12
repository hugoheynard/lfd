/**
 * Les lectures du **dossier de facturation simulé** (plan
 * `simulateur-dossier-de-facturation.md`). Des lectures pures :
 * rien n'est émis, rien n'est prélevé.
 */

/** Les trois fichiers du dossier — un par sortie. */
export type InvoiceDossierSheet = "invoice" | "orders" | "gaps";

/** Le dossier d'un payeur pour une période — celle en cours si `periodClosesAt` est absent. */
export class GetInvoiceDossierQuery {
  constructor(
    readonly companyId: string,
    /** ISO — la clôture de la période (celle du relevé), ou `undefined` pour la période en cours. */
    readonly periodClosesAt: string | undefined,
  ) {}
}

/** Une sortie du même dossier, en CSV. */
export class ExportInvoiceDossierQuery {
  constructor(
    readonly companyId: string,
    readonly periodClosesAt: string | undefined,
    readonly sheet: InvoiceDossierSheet,
  ) {}
}
