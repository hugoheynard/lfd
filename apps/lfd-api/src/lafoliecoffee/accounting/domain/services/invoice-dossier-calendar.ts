import { instantToLocal } from "@lfd/contracts";

import type { BillingCycle } from "./billing-cycle.js";
import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";
import { lastDayOf } from "./invoicing-closures.js";

/** Un bon dont la date demandée tombe hors de la période du dossier. */
export interface OutsidePeriodOrder {
  readonly reference: string;
  /** `AAAA-MM-JJ`. */
  readonly requestedDeliveryDate: string;
}

/** Ce que le dossier dit du calendrier, sans changer de périmètre. */
export interface DossierCalendarNotes {
  /** « livré la semaine suivante, facturé avec celle-ci ». */
  readonly outsidePeriod: readonly OutsidePeriodOrder[];
  /** Prélevés sans qu'aucune date de livraison ne les porte. */
  readonly withoutDate: readonly string[];
}

/**
 * **La période de livraison contre la période de passation** (plan
 * simulateur, §5 ; par période depuis R5, `plan-rythme-de-facturation.md`).
 *
 * Le dossier garde le périmètre du relevé — les bons PASSÉS dans la période —
 * pour se rapprocher du prélèvement ; une facture récapitulative, elle,
 * s'émettrait à la période de la livraison. Les bons qui divergent sont donc
 * listés, pas retirés.
 *
 * Les jours se comparent en `AAAA-MM-JJ` locaux : du premier jour de la
 * période à la veille de sa clôture, inclus.
 */
export function dossierCalendarNotes(
  orders: readonly FrozenInvoiceOrder[],
  period: BillingCycle,
): DossierCalendarNotes {
  const firstDay = instantToLocal(period.startsAt).day;
  const lastDay = lastDayOf(period.closesAt);
  const outsidePeriod: OutsidePeriodOrder[] = [];
  const withoutDate: string[] = [];
  for (const order of orders) {
    const date = order.requestedDeliveryDate;
    if (date === null) {
      withoutDate.push(order.reference);
    } else if (date < firstDay || date > lastDay) {
      outsidePeriod.push({ reference: order.reference, requestedDeliveryDate: date });
    }
  }
  return { outsidePeriod, withoutDate };
}
