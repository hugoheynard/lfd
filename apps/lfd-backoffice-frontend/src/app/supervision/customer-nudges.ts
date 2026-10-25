import type { CustomerNudgeTraceView, CustomerNudgesView } from '@lfd/contracts';

import { factWhen } from '../shared/journal/units';
import type { SlotRow } from './handover-slots';

/**
 * **Quelle relance proposer sur une ligne de retrait** (Hugo, 2026-10-25) —
 * selon qui est en retard, jamais les deux à la fois :
 *
 * - **`remind`** — « Rappel au client » : la commande est prête, le créneau
 *   est passé, le client n'est pas venu ;
 * - **`warn`** — « Avertir le client » : le créneau est passé, la commande
 *   n'est pas prête ;
 * - **`sent`** — le geste a déjà été fait : la trace le dit à la place du
 *   bouton (« Rappel envoyé le … par … »). Il ne part qu'une fois.
 *
 * Le bouton n'apparaît qu'une fois le délai réglé écoulé depuis la fin du
 * créneau (`overdueMinutes`, mesuré à l'heure du serveur). Le serveur rejuge
 * tout au geste : cette fonction ne fait que ne pas promettre un refus.
 */
export type RowNudge =
  | { readonly kind: 'remind' }
  | { readonly kind: 'warn' }
  | { readonly kind: 'sent'; readonly label: string };

export function rowNudgeOf(row: SlotRow, nudges: CustomerNudgesView | null): RowNudge | null {
  // Sans la lecture des relances, ni le délai ni la trace ne sont connus :
  // mieux vaut pas de bouton qu'un bouton qui enverrait une seconde fois.
  if (nudges === null || !isOverduePickup(row)) {
    return null;
  }
  const ready = row.readyAt !== null;
  const sent = nudges.orders.find((order) => order.orderId === row.orderId);
  const trace = ready ? sent?.pickupReminder : sent?.delayWarning;
  if (trace !== undefined && trace !== null) {
    return { kind: 'sent', label: traceLabel(ready ? 'Rappel envoyé' : 'Client averti', trace) };
  }
  const delay = ready ? nudges.pickupReminderDelayMinutes : nudges.delayWarningDelayMinutes;
  if (row.overdueMinutes === null || row.overdueMinutes < delay) {
    return null;
  }
  return { kind: ready ? 'remind' : 'warn' };
}

/** Un retrait au créneau dépassé, ni retiré, ni annulé, ni retenu au contrôle qualité. */
function isOverduePickup(row: SlotRow): boolean {
  return row.method === 'pickup' && row.state === 'overdue' && !row.heldForQuality;
}

/** « Rappel envoyé le 25 octobre 2026 à 14:05 par Léa Martin ». */
function traceLabel(what: string, trace: CustomerNudgeTraceView): string {
  const when = `${what} le ${factWhen(trace.at)}`;
  return trace.byName === null ? when : `${when} par ${trace.byName}`;
}
