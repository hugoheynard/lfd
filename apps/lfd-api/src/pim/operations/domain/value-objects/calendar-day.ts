import { addDays, localToInstant } from "@lfd/contracts";

import { InvalidOperationDayError, MidnightMissingError } from "../errors/operation-errors.js";

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * **Un jour du calendrier**, `AAAA-MM-JJ` — un jour de retrait.
 *
 * Un jour et non un instant, parce qu'une commande porte un JOUR de retrait
 * (`fulfillmentDate`). La seule traduction vers un instant est {@link end}, et
 * elle passe par `localToInstant` : un `T00:00Z` collé au jour ouvrirait et
 * fermerait l'opération une à deux heures trop tôt à Paris
 * (`lint:business-day`).
 */
export class CalendarDay {
  private constructor(readonly value: string) {}

  /**
   * @param field ce que ce jour est, pour le message (« le premier jour de retrait »).
   * @throws {InvalidOperationDayError} la forme n'est pas `AAAA-MM-JJ`, ou le
   * jour n'existe pas (un 30 février).
   */
  static of(raw: string, field: string): CalendarDay {
    // `addDays(jour, 0)` repasse par le calendrier : un 30 février en ressort
    // 2 mars, et ne se relit donc pas à l'identique.
    if (!DAY_SHAPE.test(raw) || addDays(raw, 0) !== raw) {
      throw new InvalidOperationDayError(field, raw);
    }
    return new CalendarDay(raw);
  }

  /** Vrai si ce jour tombe strictement après l'autre. L'ordre ISO est l'ordre du calendrier. */
  isAfter(other: CalendarDay): boolean {
    return this.value > other.value;
  }

  /**
   * **La fin de ce jour** : minuit, heure de Paris, le lendemain — `fin(jour)`
   * de D2. Le même instant que le `CHECK` `operations_order_until_before_end`.
   *
   * @throws {MidnightMissingError} minuit n'existe pas ce lendemain-là à Paris
   * (impossible tant que les bascules d'heure tombent la nuit).
   */
  end(): Date {
    const next = addDays(this.value, 1);
    const instant = localToInstant(next, "00:00");
    if (instant === null) {
      throw new MidnightMissingError(next);
    }
    return instant;
  }

  /** `JJ/MM/AAAA` — la forme que lit le staff. */
  toFrench(): string {
    const [year, month, day] = this.value.split("-");
    return `${day ?? ""}/${month ?? ""}/${year ?? ""}`;
  }
}
