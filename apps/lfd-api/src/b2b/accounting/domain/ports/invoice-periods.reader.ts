import type { BillingCycle } from "../services/billing-cycle.js";

/**
 * La **période facturée** d'une pièce — elle n'est pas sur la facture : la
 * facture par période (E4, R3) la range sur son issue
 * (`invoice_monthly_outcome.period_closes_at`). Une pièce absente de la carte
 * n'est pas une facture de période (un avoir, une facture carte).
 *
 * La borne basse est la clôture précédente réelle sous le rythme de l'entité
 * (`previousClosureOf`). ⚠️ Le rythme n'a pas d'historique (§12 du plan
 * `plan-rythme-de-facturation.md`) : elle est relue sous le réglage du jour,
 * exacte tant que l'entité n'a pas changé deux fois de rythme depuis la pièce.
 * La clôture, elle, est rangée — exacte toujours.
 *
 * Port à part d'`InvoiceReader` (ISP) : seules les vues l'appellent.
 */
export abstract class InvoicePeriodsReader {
  abstract periodsOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, BillingCycle>>;
}
