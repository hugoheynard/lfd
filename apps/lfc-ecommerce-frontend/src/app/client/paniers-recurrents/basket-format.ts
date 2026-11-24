import type { FulfillmentWindow, RecurringOccurrenceView, SubscriptionView } from '@lfd/contracts';

import type { RecurringBasketsCopy } from '../copy/screens/recurring-baskets.copy';
import { fill } from '../copy/client-copy.service';
import { formatWindow } from '../format-hour';

/** Les échéances d'un panier, partagées par le jour de Paris d'aujourd'hui. */
export interface OccurrenceSplit {
  readonly upcoming: readonly RecurringOccurrenceView[];
  readonly past: readonly RecurringOccurrenceView[];
}

/**
 * À venir (aujourd'hui compris) et passées. Les annulées ne se montrent pas :
 * un jour tombé en pause ou un panier arrêté ne sont pas des commandes, et la
 * pastille « En pause » le dit déjà.
 */
export function splitOccurrences(
  occurrences: readonly RecurringOccurrenceView[],
  today: string,
): OccurrenceSplit {
  const shown = occurrences.filter((occurrence) => occurrence.state !== 'cancelled');
  return {
    upcoming: shown.filter((occurrence) => occurrence.serviceDay >= today),
    past: shown.filter((occurrence) => occurrence.serviceDay < today),
  };
}

/** Le créneau du panier ; un panier sans créneau le dit plutôt que d'en inventer un. */
export function windowLabel(window: FulfillmentWindow | null, copy: RecurringBasketsCopy): string {
  return window === null ? copy.noSlot : formatWindow(window.start, window.end, copy.before);
}

/** « Depuis le … » ou « Du … au … ». */
export function periodLabel(
  basket: Pick<SubscriptionView, 'startDate' | 'endDate'>,
  copy: RecurringBasketsCopy,
  day: (iso: string) => string,
): string {
  return basket.endDate === null
    ? fill(copy.since, { start: day(basket.startDate) })
    : fill(copy.between, { start: day(basket.startDate), end: day(basket.endDate) });
}

/** Une échéance qu'on peut encore changer : prévue ou sautée, et pas passée. */
export function isEditable(occurrence: RecurringOccurrenceView): boolean {
  return occurrence.state === 'planned' || occurrence.state === 'skipped';
}

/** Une échéance qui n'est pas au panier habituel, et que « Rétablir » y ramène. */
export function isRestorable(occurrence: RecurringOccurrenceView): boolean {
  return (
    occurrence.state === 'skipped' || (occurrence.state === 'planned' && occurrence.overridden)
  );
}

/** Refusée ou manquée : la même phrase, jamais la cause. */
export function isNotPlaced(occurrence: RecurringOccurrenceView): boolean {
  return occurrence.state === 'refused' || occurrence.state === 'missed';
}
