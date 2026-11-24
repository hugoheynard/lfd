import type { Basket } from "../../../basket/domain/entities/basket.js";
import { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import { Occurrence } from "../entities/occurrence.js";

/** La création à l'avance couvre huit semaines (Q-B3, Hugo, 2026-11-24). */
export const ADVANCE_WEEKS = 8;
const DAYS_PER_WEEK = 7;

/** Ce que la création à l'avance décide pour un panier. */
export interface AdvancePlan {
  /** Les échéances à créer, dans l'ordre du calendrier. */
  readonly created: readonly Occurrence[];
  /** Le jour jusqu'où le panier est désormais planifié, `null` s'il n'est pas servi. */
  readonly through: IsoDate | null;
}

/**
 * **Les échéances qui manquent à un panier**, de `max(début, aujourd'hui)` à
 * aujourd'hui + huit semaines (plan `plan-bloc-recurrent.md`, § 5). Seul un
 * panier servi — actif et d'une société — en reçoit ; un jour qui a déjà sa
 * ligne, quel que soit son état, n'en reçoit pas une seconde.
 *
 * Pure : les identifiants et l'instant viennent de l'appelant.
 */
export function advancePlan(input: {
  readonly basket: Basket;
  readonly existingDays: ReadonlySet<string>;
  readonly today: IsoDate;
  readonly at: Date;
  readonly nextId: () => string;
}): AdvancePlan {
  const { basket, today } = input;
  if (!basket.isServed) {
    return { created: [], through: null };
  }
  const horizon = today.plusDays(ADVANCE_WEEKS * DAYS_PER_WEEK);
  const created = basket
    .serviceDaysBetween(IsoDate.latest(basket.startDate, today), horizon)
    .filter((day) => !input.existingDays.has(day.toString()))
    .map((serviceDay) =>
      Occurrence.plan({ id: input.nextId(), basketId: basket.id, serviceDay, at: input.at }),
    );
  return { created, through: horizon };
}
