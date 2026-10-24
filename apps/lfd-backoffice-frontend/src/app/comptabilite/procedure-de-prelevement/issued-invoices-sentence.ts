import type { MonthlyInvoiceReportView } from '@lfd/contracts';

import { day } from '../invoice-dossier-format';
import { periodLastDay } from './month-invoices/month-invoices';

/**
 * Le compte rendu d'une émission, en une phrase : ce qui est parti, ce qui
 * est signalé, ce qui l'était déjà — et, en tête, une émission faite après
 * le dernier jour de la période, que le lecteur doit voir d'abord.
 */
export function issuedInvoicesSentence(
  report: MonthlyInvoiceReportView,
  periodClosesAt: string,
): string {
  const lastDay = periodLastDay(periodClosesAt);
  const late = report.issued.find((issued) => issued.issuedOn > lastDay);
  return (
    (late === undefined ? '' : `Émise(s) en retard, le ${day(late.issuedOn)} — `) +
    `${String(report.issued.length)} facture(s) émise(s), ` +
    `${String(report.blocked.length)} facture(s) signalée(s)` +
    (report.alreadyInvoiced > 0
      ? `, ${String(report.alreadyInvoiced)} déjà émise(s) pour cette période.`
      : '.')
  );
}
