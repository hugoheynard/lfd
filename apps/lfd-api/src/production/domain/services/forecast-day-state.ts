import { addDays, type ProductionForecastDayState } from "@lfd/contracts";

import type { CloseSettingsValues } from "../entities/production-close-settings.js";
import {
  armed,
  attemptNeedsHand,
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
}

/** L'instant de la maison auquel l'état est dit. */
export interface HouseMoment {
  /** Aujourd'hui, `AAAA-MM-JJ`, à l'heure de Paris. */
  readonly today: string;
  /** L'heure courante, `HH:MM`, à l'heure de Paris. */
  readonly time: string;
  readonly now: Date;
  readonly settings: CloseSettingsValues;
}

/**
 * **L'état d'une journée du prévisionnel** (plan `arret-du-plan.md`, §5,
 * lot A3), dans cet ordre de priorité :
 *
 * 1. `past` — avant aujourd'hui ;
 * 2. `closed` — plan arrêté ;
 * 3. `overdue` — en retard : l'arrêt automatique a échoué ou est resté en
 *    suspens (Q8) ; aujourd'hui non arrêté avec des commandes (S4) ; demain non
 *    arrêté, non vide, non fermé, l'heure du réglage passée ;
 * 4. `closedDay` — jour fermé du fournil ;
 * 5. `open` — le reste.
 *
 * Les seuils sont ceux du tour (A2) — `armed`, `attemptNeedsHand`,
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
  if (facts.date === moment.today) {
    return todayNeedsCatchUp(false, facts.orderCount);
  }
  if (facts.date === addDays(moment.today, 1)) {
    return !facts.isClosedDay && facts.orderCount > 0 && armed(moment.settings, moment.time);
  }
  return false;
}
