import type {
  IssuedInvoiceLineView,
  IssuedInvoiceSummaryView,
  MyInvoiceSettlementStatus,
  MyInvoiceSettlementView,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

import type { LocaleCode } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import type { AccountInvoicesCopy } from '../copy/screens/account-invoices.copy';

/**
 * Les mises en forme de « Mes factures » — la page `/mes-factures` et le
 * dialogue d'une pièce les partagent. Entiers jusqu'au bout : la quantité est en
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

/** `9` → « septembre » : le nom du mois, pour le filtre. */
export function monthName(month: number, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 15)),
  );
}

/** Le libellé de chaque statut de règlement (plan `plan-page-mes-factures.md` §7.1). */
function statusLabel(status: MyInvoiceSettlementStatus, copy: AccountInvoicesCopy): string {
  const labels: Readonly<Record<MyInvoiceSettlementStatus, string>> = {
    card_paid: copy.statusCardPaid,
    collection_planned: copy.statusCollectionPlanned,
    collected: copy.statusCollected,
    collection_rejected: copy.statusRejected,
    recollection_planned: copy.statusRecollectionPlanned,
    settled: copy.statusSettled,
    closed: copy.statusClosed,
    processing: copy.statusProcessing,
  };
  return labels[status];
}

/** « Prélevée le 5 oct. 2026 » ; le libellé seul quand le statut n'a pas de date. */
export function settlementLabel(
  settlement: MyInvoiceSettlementView,
  copy: AccountInvoicesCopy,
  locale: LocaleCode,
): string {
  const label = statusLabel(settlement.status, copy);
  return settlement.date === null
    ? label
    : `${label} ${fill(copy.statusOn, { date: invoiceDay(settlement.date, locale) })}`;
}

/**
 * Le ton de la pastille : le rejet est le SEUL état en défaut (Hugo, Q1) ; ce
 * qui attend notre équipe ou est clos ne demande rien au client.
 */
export function settlementTone(status: MyInvoiceSettlementStatus): FoldBadgeVariant {
  const tones: Readonly<Record<MyInvoiceSettlementStatus, FoldBadgeVariant>> = {
    card_paid: 'success',
    collection_planned: 'info',
    collected: 'success',
    collection_rejected: 'alert',
    recollection_planned: 'info',
    settled: 'success',
    closed: 'neutral',
    processing: 'neutral',
  };
  return tones[status];
}

/**
 * « rejeté avec 2 autres factures du même prélèvement » — un rejet porte sur
 * toute la ligne bancaire (§7.1). `null` hors rejet, ou seule sur sa ligne.
 */
export function rejectedWithOthers(
  settlement: MyInvoiceSettlementView,
  copy: AccountInvoicesCopy,
): string | null {
  const others = settlement.otherInvoicesOnDebit;
  if (settlement.status !== 'collection_rejected' || others === 0) {
    return null;
  }
  return others === 1 ? copy.rejectedWithOne : fill(copy.rejectedWith, { n: String(others) });
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

/** `2000` → « 2 » ; en kilos, toujours trois décimales : « 1,250 kg », « 2,000 kg ». */
export function invoiceQuantity(
  line: Pick<IssuedInvoiceLineView, 'quantityThousandths' | 'unitCode'>,
): string {
  const whole = Math.trunc(line.quantityThousandths / THOUSANDTHS);
  const rest = String(line.quantityThousandths % THOUSANDTHS).padStart(3, '0');
  if (line.unitCode === 'KGM') {
    // Toujours trois décimales au kilo, comme le PDF : « 2,000 kg », jamais « 2 kg ».
    return `${String(whole)},${rest} kg`;
  }
  return rest === '000' ? String(whole) : `${String(whole)},${rest}`;
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
