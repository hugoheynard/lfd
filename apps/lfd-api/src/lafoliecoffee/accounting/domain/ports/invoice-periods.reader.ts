import type { BillingCycle } from "../services/billing-cycle.js";

/**
 * La **période facturée** d'une pièce — elle n'est pas sur la facture : la
 * facture par période (E4, R3) la range sur son issue
 * (`invoice_monthly_outcome.period_closes_at`). Une pièce absente de la carte
 * n'est pas une facture de période (un avoir, une facture carte).
 *
 * Les deux bornes sont rangées sur l'issue depuis M4a (plan
 * `plan-rythme-de-facturation.md`, §16.9) : la borne basse est la clôture
 * précédente réelle DU PAYEUR au jour de l'émission. Une issue d'avant (borne
 * basse absente) la recalcule sous le mode mensuel de l'entité.
 *
 * Port à part d'`InvoiceReader` (ISP) : seules les vues l'appellent.
 */
export abstract class InvoicePeriodsReader {
  abstract periodsOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, BillingCycle>>;
}
