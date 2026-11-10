import { instantToLocal } from "@lfd/contracts";

import type { InvoicingCalendar } from "./invoicing-calendar.js";

/**
 * **Les clôtures que l'écran « Prélèvement du mois » montre à `now`** (plan
 * `plan-rythme-de-facturation.md`, §16.13, M4c) : celles du calendrier qui
 * tombent dans le mois de `now` (jour de Paris de la clôture), plus la
 * dernière atteinte et celle dont on émet les factures si elles n'en sont pas
 * — la plus ancienne d'abord.
 *
 * Le mois est celui de l'INSTANT de clôture, pas du dernier jour qu'il ferme :
 * le 1er octobre appartient à octobre, avec les lundis d'octobre, et c'est le
 * lot d'octobre qu'il encaisse. Le 1er novembre, qui ferme le 31 octobre,
 * n'y entre qu'en devenant la clôture à émettre (le 31 à 23h55).
 *
 * Borné par construction : un mois porte au plus cinq lundis, deux dates du
 * deux-fois-par-mois et une du mensuel.
 */
export function closuresOfMonth(calendar: InvoicingCalendar, now: Date): readonly Date[] {
  const month = monthOf(now);
  const found = new Map<number, Date>();
  const add = (closure: Date): void => {
    found.set(closure.getTime(), closure);
  };
  const last = calendar.lastClosureAtOrBefore(now);
  add(last);
  add(calendar.closureToInvoice(now));
  for (let cursor = last; monthOf(cursor) === month; cursor = calendar.closureBefore(cursor)) {
    add(cursor);
  }
  for (
    let cursor = calendar.closureAfter(now);
    monthOf(cursor) === month;
    cursor = calendar.closureAfter(cursor)
  ) {
    add(cursor);
  }
  return [...found.values()].sort((left, right) => left.getTime() - right.getTime());
}

/** `AAAA-MM` — le mois de Paris d'un instant. */
function monthOf(instant: Date): string {
  return instantToLocal(instant).day.slice(0, 7);
}
