/**
 * Le **mois facturé** d'une pièce (`AAAA-MM`, le mois des commandes, Q2) —
 * il n'est pas sur la facture : la facture du mois (E4) le range sur son
 * issue (`invoice_monthly_outcome`). Une pièce absente de la carte n'est pas
 * une facture du mois (un avoir, demain une facture carte).
 *
 * Port à part d'`InvoiceReader` (ISP) : seules les vues l'appellent.
 */
export abstract class InvoicePeriodsReader {
  abstract periodsOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
