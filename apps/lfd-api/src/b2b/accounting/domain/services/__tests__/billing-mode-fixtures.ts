import { localToInstant } from "@lfd/contracts";

import { ModeDatesTimeline } from "../mode-dates-timeline.js";
import type { ModeTimelines } from "../payer-timeline.js";

/**
 * Minuit à Paris ce jour-là — la clôture. Les dates des suites de M1 ne sont
 * comparées qu'entre elles et aux instants donnés : aucune horloge n'est lue.
 */
export function paris(day: string, time = "00:00"): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new RangeError(`${day} ${time} n'existe pas à Paris`);
  }
  return instant;
}

/** Les trois modes à leurs dates par défaut. */
export function defaultModes(overrides: Partial<ModeTimelines> = {}): ModeTimelines {
  return {
    monthly: ModeDatesTimeline.defaultOf("monthly"),
    semimonthly: ModeDatesTimeline.defaultOf("semimonthly"),
    weekly: ModeDatesTimeline.defaultOf("weekly"),
    ...overrides,
  };
}
