import type { FrozenInvoiceOrder } from "./invoice-dossier.types.js";

/** Un bon dont la date demandée tombe hors du mois du dossier. */
export interface OtherMonthOrder {
  readonly reference: string;
  /** `AAAA-MM-JJ`. */
  readonly requestedDeliveryDate: string;
}

/** Ce que le dossier dit du calendrier, sans changer de périmètre. */
export interface DossierCalendarNotes {
  /** « livré en novembre, facturé avec octobre ». */
  readonly otherMonth: readonly OtherMonthOrder[];
  /** Prélevés sans qu'aucun mois de livraison ne les porte. */
  readonly withoutDate: readonly string[];
}

const MONTH_PREFIX_LENGTH = "AAAA-MM".length;

/**
 * **Le mois de livraison contre le mois de passation** (plan simulateur, §5).
 *
 * Le dossier garde le périmètre du relevé — les bons PASSÉS dans le mois —
 * pour se rapprocher du prélèvement ; une facture récapitulative, elle,
 * s'émettrait au mois de la livraison. Les bons qui divergent sont donc
 * listés, pas retirés.
 *
 * @param month `AAAA-MM`, le mois du dossier.
 */
export function dossierCalendarNotes(
  orders: readonly FrozenInvoiceOrder[],
  month: string,
): DossierCalendarNotes {
  const otherMonth: OtherMonthOrder[] = [];
  const withoutDate: string[] = [];
  for (const order of orders) {
    const date = order.requestedDeliveryDate;
    if (date === null) {
      withoutDate.push(order.reference);
    } else if (date.slice(0, MONTH_PREFIX_LENGTH) !== month) {
      otherMonth.push({ reference: order.reference, requestedDeliveryDate: date });
    }
  }
  return { otherMonth, withoutDate };
}
