import type { InvoiceSpecimenMeans } from "../document-specimens/specimen-data.js";

/**
 * **La facture d'EXEMPLE** — PDF/A-3 Factur-X, la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Aucune pièce en paramètre : la facture est rendue à partir de données
 * fixes, sans moyen figé ou au virement. Une lecture : rien n'est numéroté,
 * rangé ni envoyé.
 */
export class GetInvoiceSpecimenQuery {
  constructor(readonly means: InvoiceSpecimenMeans = "none") {}
}
