import type { OrderSummaryBottomView, OrderSummaryExclusionReason } from '@lfd/contracts';

import type { LocaleCode } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import type { OrderSummaryCopy } from '../copy/screens/order-summary.copy';
import { formatCents, formatRate } from '../format-money';
import type { OrderDays } from './client-order-history.service';

/**
 * Les mises en forme du récapitulatif (plan
 * `documentation/commandes/plan-recapitulatif-des-commandes.md`, lot R3) —
 * des MOTS posés sur ce que le serveur a sommé, jamais un calcul.
 */

/** Une ligne du bas, comme sur la facture. */
export interface SummaryBottomLine {
  readonly label: string;
  readonly amount: string;
  readonly strong: boolean;
}

/**
 * Le bas dans l'ordre d'une facture (§6.1), celui du PDF : sous-total, remises,
 * bons, livraison, surtaxes, TVA par taux, TVA non ventilée, TTC. Les gestes
 * nuls sont tus, comme à l'impression ; les déductions portent leur signe.
 */
export function summaryBottomLines(
  bottom: OrderSummaryBottomView,
  copy: OrderSummaryCopy,
): readonly SummaryBottomLine[] {
  const line = (label: string, cents: number, strong = false): SummaryBottomLine => ({
    label,
    amount: formatCents(cents),
    strong,
  });
  const optional: readonly (readonly [string, number])[] = [
    [copy.discount, -bottom.discountCents],
    [copy.voucher, -bottom.voucherDiscountCents],
    [copy.deliveryFee, bottom.deliveryFeeCents],
    [copy.lateFee, bottom.lateFeeCents],
  ];
  return [
    line(copy.subtotal, bottom.subtotalCents),
    ...optional.filter(([, cents]) => cents !== 0).map(([label, cents]) => line(label, cents)),
    ...bottom.vat.map((share) =>
      line(fill(copy.vat, { rate: formatRate(share.rate) }), share.amountCents),
    ),
    ...(bottom.unventilatedVatCents === 0
      ? []
      : [line(copy.unventilatedVat, bottom.unventilatedVatCents)]),
    line(copy.total, bottom.totalCents, true),
  ];
}

/** « 1 commande » / « 12 commandes ». */
export function orderCountLabel(count: number, copy: OrderSummaryCopy): string {
  return count === 1 ? copy.orderCountOne : fill(copy.orderCountMany, { n: String(count) });
}

/** « 3 sélectionnées », « 1 sélectionnée », « Aucune sélectionnée ». */
export function selectedLabel(count: number, copy: OrderSummaryCopy): string {
  if (count === 0) {
    return copy.selectedNone;
  }
  return count === 1 ? copy.selectedOne : fill(copy.selectedMany, { n: String(count) });
}

export function exclusionLabel(
  reason: OrderSummaryExclusionReason,
  copy: OrderSummaryCopy,
): string {
  const labels: Record<OrderSummaryExclusionReason, string> = {
    cancelled: copy.excludedCancelled,
    payment_pending: copy.excludedPending,
    payment_failed: copy.excludedFailed,
  };
  return labels[reason];
}

const INTL_LOCALE: Readonly<Record<LocaleCode, string>> = { fr: 'fr-FR', en: 'en-GB', it: 'it-IT' };

/** `2026-10-01` → « 1 octobre 2026 » — un jour civil, lu et écrit en UTC. */
function longDay(day: string, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00.000Z`));
}

/** La période du filtre affiché, en phrase ; `null` sans borne. */
export function periodLabel(
  days: OrderDays,
  copy: OrderSummaryCopy,
  locale: LocaleCode,
): string | null {
  const from = days.from === null ? null : longDay(days.from, locale);
  const to = days.to === null ? null : longDay(days.to, locale);
  if (from !== null && to !== null) {
    return fill(copy.periodBetween, { from, to });
  }
  if (from !== null) {
    return fill(copy.periodFrom, { from });
  }
  return to === null ? null : fill(copy.periodTo, { to });
}
