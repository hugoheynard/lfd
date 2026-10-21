import { addDays, type ProductionForecastDayState } from "@lfd/contracts";

import {
  attemptNeedsHand,
  closeDue,
  closesOnItsOwnDay,
  todayNeedsCatchUp,
  type AttemptTrace,
} from "./auto-close-round.js";

/** Ce qu'on sait d'une colonne du prévisionnel pour dire son état. */
export interface ForecastDayFacts {
  /** `AAAA-MM-JJ`. */
  readonly date: string;
  /** Le plan de la journée est arrêté. */
  readonly planClosed: boolean;
  readonly orderCount: number;
  /** Un jour fermé du fournil (A1, Q6). */
  readonly isClosedDay: boolean;
  /** La tentative automatique tracée pour cette journée, ou `null`. */
  readonly attempt: AttemptTrace | null;
  /** L'instant où son plan s'arrête tout seul (`planClosesAt`), ou `null`. */
  readonly closesAt: Date | null;
}

/** L'instant de la maison auquel l'état est dit. */
export interface HouseMoment {
  /** Aujourd'hui, `AAAA-MM-JJ`, à l'heure de Paris. */
  readonly today: string;
  readonly now: Date;
}

/**
 * **L'état d'une journée du prévisionnel** (plan `arret-du-plan.md`, §5,
 * lot A3), dans cet ordre de priorité :
 *
 * 1. `past` — avant aujourd'hui ;
 * 2. `closed` — plan arrêté ;
 * 3. `overdue` — en retard : l'arrêt automatique a échoué ou est resté en
 *    suspens (Q8) ; aujourd'hui non arrêté avec des commandes (S4), sauf si
 *    son arrêt automatique tombe aujourd'hui et n'est pas encore passé ;
 *    demain non arrêté, non vide, non fermé, son arrêt automatique passé ;
 * 4. `closedDay` — jour fermé du fournil ;
 * 5. `open` — le reste.
 *
 * Les seuils sont ceux du tour (A2) — `closeDue`, `attemptNeedsHand`,
 * `todayNeedsCatchUp` —, pas une copie : l'écran et la cloche ne peuvent pas
 * dire deux choses différentes de la même journée.
 */
export function forecastDayState(
  facts: ForecastDayFacts,
  moment: HouseMoment,
): ProductionForecastDayState {
  if (facts.date < moment.today) {
    return "past";
  }
  if (facts.planClosed) {
    return "closed";
  }
  if (overdue(facts, moment)) {
    return "overdue";
  }
  return facts.isClosedDay ? "closedDay" : "open";
}

function overdue(facts: ForecastDayFacts, moment: HouseMoment): boolean {
  if (facts.attempt !== null && attemptNeedsHand(facts.attempt, moment.now)) {
    return true;
  }
  if (facts.date === moment.today && !closesOnItsOwnDay(facts.closesAt, moment.today)) {
    return todayNeedsCatchUp(false, facts.orderCount);
  }
  if (facts.date === moment.today || facts.date === addDays(moment.today, 1)) {
    return !facts.isClosedDay && facts.orderCount > 0 && closeDue(facts.closesAt, moment.now);
  }
  return false;
}
