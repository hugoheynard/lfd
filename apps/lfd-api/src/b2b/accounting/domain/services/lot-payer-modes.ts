import type { InvoicingCalendar } from "./invoicing-calendar.js";
import { BILLING_MODES, type BillingMode } from "../value-objects/billing-mode.js";

/** Un payeur prélevé par un lot, et la clôture de la période qu'il y paie. */
export interface LotPayerPeriod {
  readonly payerCompanyId: string;
  readonly periodClosesAt: Date;
}

/** Un payeur prélevé et la facture qu'il paie ; `null` : une ligne d'arrêté. */
export interface LotPayerRef {
  readonly payerCompanyId: string;
  readonly invoiceId: string | null;
}

/**
 * Les périodes des payeurs d'un lot : celle de chaque facture (rangée sur son
 * issue), la clôture du lot pour une ligne d'arrêté ou une pièce sans période.
 */
export function lotPayerPeriods(
  refs: readonly LotPayerRef[],
  periodClosesAtOf: (invoiceId: string) => Date | undefined,
  lotClosesAt: Date,
): readonly LotPayerPeriod[] {
  return refs.map((ref) => ({
    payerCompanyId: ref.payerCompanyId,
    periodClosesAt:
      (ref.invoiceId === null ? undefined : periodClosesAtOf(ref.invoiceId)) ?? lotClosesAt,
  }));
}

/**
 * **Les modes des clients prélevés par un lot** (Hugo, 2026-10-12, plan
 * `plan-rythme-de-facturation.md` §16.13) : pour chaque facture prélevée, le
 * mode sous lequel son payeur a clos SA période — pas les modes qui closent à
 * l'instant du lot. Le lot du lundi 5 qui rattrape une facture mensuelle du
 * 1er dit donc « hebdomadaires et mensuels ». Ordre de `BILLING_MODES`.
 */
export function lotPayerModes(
  calendar: InvoicingCalendar,
  periods: readonly LotPayerPeriod[],
): readonly BillingMode[] {
  const modes = new Set(
    periods.map((period) =>
      calendar.payerModeClosingAt(period.payerCompanyId, period.periodClosesAt),
    ),
  );
  return BILLING_MODES.filter((mode) => modes.has(mode));
}
