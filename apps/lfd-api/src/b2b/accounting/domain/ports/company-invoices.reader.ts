import type { Invoice } from "../entities/invoice.js";

/**
 * Port de LECTURE des pièces qu'une société cliente voit dans « Mes
 * factures » (E6, suite (a) bâtie le 2026-10-09) : celles dont elle est
 * l'acheteur, **et** celles qui couvrent au moins un de ses bons — un site
 * voit la facture de sa maison mère qui porte sa commande, jamais celle d'un
 * site frère. Le mur est dans la requête, pas dans l'appelant.
 */
export abstract class CompanyInvoicesReader {
  /** Les pièces visibles, dans l'ordre des numéros. */
  abstract visibleTo(companyId: string): Promise<readonly Invoice[]>;

  /** La pièce si elle est visible par cette société, sinon `null` (absente ou d'un autre). */
  abstract oneVisibleTo(invoiceId: string, companyId: string): Promise<Invoice | null>;
}
