import { DEFAULT_BILLING_MODE, type BillingMode } from "../value-objects/billing-mode.js";
import { lastClosureAtOrBefore } from "./entity-closures.js";
import { closureAfter } from "./invoicing-closures.js";
import type { ModeTimelines } from "./payer-timeline.js";

/**
 * **Le calendrier des clôtures de l'entité** (plan
 * `plan-rythme-de-facturation.md`, §16.2 et §16.6-6) : l'union des timelines
 * des modes qui ont au moins un payeur en service, plus le mensuel — le mode
 * de tout payeur qui n'a rien choisi. Au plus trois suites de dates.
 *
 * Une entité sans payeur hebdomadaire n'a donc ni tentative ni alerte un
 * lundi. Ce n'est PAS une timeline au sens de R3 (deux modes peuvent clore le
 * même jour, ou des jours différents) : il ne rend que des instants.
 *
 * Pur et immuable.
 */
export class ClosureCalendar {
  private constructor(
    readonly modes: readonly BillingMode[],
    private readonly timelines: ModeTimelines,
  ) {}

  /**
   * @param modesInService les modes qu'au moins un payeur suit ; le mensuel
   *   est toujours ajouté.
   */
  static of(timelines: ModeTimelines, modesInService: readonly BillingMode[]): ClosureCalendar {
    const modes = [...new Set<BillingMode>([DEFAULT_BILLING_MODE, ...modesInService])];
    return new ClosureCalendar(modes, timelines);
  }

  /** La prochaine clôture d'un des modes, strictement après `instant`. */
  closureAfter(instant: Date): Date {
    return earliest(this.modes.map((mode) => closureAfter(instant, this.timelines[mode])));
  }

  /** La dernière clôture d'un des modes atteinte à `now` (≤ `now`). */
  lastClosureAtOrBefore(now: Date): Date {
    return latest(this.modes.map((mode) => lastClosureAtOrBefore(now, this.timelines[mode])));
  }

  /** Cet instant est-il la clôture d'un des modes ? */
  isClosure(instant: Date): boolean {
    const justBefore = new Date(instant.getTime() - 1);
    return this.modes.some(
      (mode) => closureAfter(justBefore, this.timelines[mode]).getTime() === instant.getTime(),
    );
  }

  /** Les modes qui closent à `instant`. */
  modesClosingAt(instant: Date): readonly BillingMode[] {
    const justBefore = new Date(instant.getTime() - 1);
    return this.modes.filter(
      (mode) => closureAfter(justBefore, this.timelines[mode]).getTime() === instant.getTime(),
    );
  }

  /** Les `count` prochaines clôtures du calendrier, strictement après `now`. */
  upcoming(now: Date, count: number): readonly Date[] {
    const closures: Date[] = [];
    let cursor = now;
    while (closures.length < count) {
      cursor = this.closureAfter(cursor);
      closures.push(cursor);
    }
    return closures;
  }
}

function earliest(dates: readonly Date[]): Date {
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function latest(dates: readonly Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}
