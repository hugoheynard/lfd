import type { IssuedInvoiceLineView, IssuedInvoiceSummaryView } from '@lfd/contracts';

import type { LocaleCode } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import type { AccountInvoicesCopy } from '../../copy/screens/account-invoices.copy';

/**
 * Les mises en forme de « Mes factures » (E6) — les deux cartes et le
 * dialogue les partagent. Entiers jusqu'au bout : la quantité est en
 * millièmes, le taux de pénalité en points de base.
 */

const THOUSANDTHS = 1_000;
const BASIS_POINTS_PER_PERCENT = 100;

/** Le format de date de chaque langue — un jour civil, lu et écrit en UTC. */
const INTL_LOCALE: Readonly<Record<LocaleCode, string>> = { fr: 'fr-FR', en: 'en-GB', it: 'it-IT' };

/** `2026-09-30` → « 30 sept. 2026 » (selon la langue). */
export function invoiceDay(day: string, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00.000Z`));
}

/** `2026-09` → « septembre 2026 ». */
export function invoiceMonth(month: string, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T12:00:00.000Z`));
}

/** « 3 factures », « 1 facture ». */
export function invoicesCount(count: number, copy: AccountInvoicesCopy): string {
  return count === 1 ? copy.countOne : fill(copy.count, { n: String(count) });
}

/** « Facture » ou « Avoir ». */
export function invoiceKind(
  invoice: Pick<IssuedInvoiceSummaryView, 'kind'>,
  copy: AccountInvoicesCopy,
): string {
  return invoice.kind === 'invoice' ? copy.invoice : copy.creditNote;
}

/** « émise le 30 sept. 2026 · commandes de septembre 2026 · échéance le 15 oct. 2026 ». */
export function invoiceMeta(
  invoice: IssuedInvoiceSummaryView,
  copy: AccountInvoicesCopy,
  locale: LocaleCode,
): string {
  const parts = [fill(copy.issuedOn, { date: invoiceDay(invoice.issuedOn, locale) })];
  if (invoice.period !== null) {
    parts.push(fill(copy.period, { period: invoiceMonth(invoice.period, locale) }));
  }
  if (invoice.dueOn !== null) {
    parts.push(fill(copy.dueOn, { date: invoiceDay(invoice.dueOn, locale) }));
  }
  if (invoice.correctedInvoiceNumber !== null) {
    parts.push(fill(copy.corrects, { number: invoice.correctedInvoiceNumber }));
  }
  return parts.join(' · ');
}

/** `2000` → « 2 » ; `1250` en kilos → « 1,250 kg ». */
export function invoiceQuantity(
  line: Pick<IssuedInvoiceLineView, 'quantityThousandths' | 'unitCode'>,
): string {
  const whole = Math.trunc(line.quantityThousandths / THOUSANDTHS);
  const rest = line.quantityThousandths % THOUSANDTHS;
  const number = rest === 0 ? String(whole) : `${String(whole)},${String(rest).padStart(3, '0')}`;
  return line.unitCode === 'KGM' ? `${number} kg` : number;
}

/** `1415` → « 14,15 % ». */
export function basisPoints(value: number): string {
  const whole = Math.trunc(value / BASIS_POINTS_PER_PERCENT);
  const rest = value % BASIS_POINTS_PER_PERCENT;
  return rest === 0 ? `${String(whole)} %` : `${String(whole)},${String(rest).padStart(2, '0')} %`;
}

const MILLICENTS_PER_EURO = 100_000;
const MILLICENT_DIGITS = 5;
const CENT_DIGITS = 2;

/**
 * Un prix unitaire en millicentimes → « 1,2345 € » : deux décimales au moins,
 * cinq au plus, sans zéro de traîne au-delà des centimes. Entiers seulement.
 */
export function unitPriceLabel(millicents: number): string {
  const sign = millicents < 0 ? '−' : '';
  const absolute = Math.abs(millicents);
  const whole = Math.floor(absolute / MILLICENTS_PER_EURO);
  let fraction = String(absolute % MILLICENTS_PER_EURO).padStart(MILLICENT_DIGITS, '0');
  while (fraction.length > CENT_DIGITS && fraction.endsWith('0')) {
    fraction = fraction.slice(0, -1);
  }
  return `${sign}${String(whole)},${fraction} €`;
}
