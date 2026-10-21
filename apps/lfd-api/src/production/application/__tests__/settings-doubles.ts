import {
  DayResuppliesReader,
  type PlacedResupply,
} from "../../channels/commerce/day-resupplies.reader.js";
import { OrderCutoffRulesReader } from "../../channels/commerce/order-cutoff-rules.reader.js";
import { ResupplyCutoffTimeReader } from "../../channels/commerce/resupply-cutoff-time.reader.js";
import type { ProductionClosedDay } from "../../domain/entities/production-closed-day.js";
import { ProductionClosedDayRepository } from "../../domain/ports/production-closed-day.repository.js";
import { ProductionSettingsReader } from "../../domain/ports/production-settings.reader.js";
import type { OrderCutoffRule } from "../../domain/services/latest-order-cutoff.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PlanStopRules } from "../services/plan-stop-rules.js";

/** Le calendrier doublé : un ensemble de jours, qui dit s'il a changé. */
export class ClosedDaysTable extends ProductionClosedDayRepository {
  readonly days = new Map<string, string>();

  add(day: ProductionClosedDay): Promise<boolean> {
    if (this.days.has(day.serviceDay.value)) {
      return Promise.resolve(false);
    }
    this.days.set(day.serviceDay.value, day.declaredBy);
    return Promise.resolve(true);
  }

  remove(day: ServiceDay): Promise<boolean> {
    return Promise.resolve(this.days.delete(day.value));
  }
}

/** La lecture, branchée sur le calendrier doublé. */
export class SettingsReader extends ProductionSettingsReader {
  constructor(private readonly closedDays: ClosedDaysTable) {
    super();
  }

  closedDaysFrom(from: string): Promise<readonly string[]> {
    return Promise.resolve([...this.closedDays.days.keys()].filter((day) => day >= from).sort());
  }
}

/** Les heures limites du commerce, posées par le test. */
export class CutoffRules extends OrderCutoffRulesReader {
  constructor(public current: readonly OrderCutoffRule[] = []) {
    super();
  }

  rules(): Promise<readonly OrderCutoffRule[]> {
    return Promise.resolve(this.current);
  }
}

/**
 * L'heure du réassort, posée par le test (lot R3a). Par défaut minuit la
 * veille : la plus tôt possible, elle ne repousse aucun arrêt — les suites
 * d'avant le réassort gardent l'heure qu'elles éprouvent.
 */
export class ResupplyTime extends ResupplyCutoffTimeReader {
  constructor(public current = "00:00") {
    super();
  }

  eveTime(): Promise<string> {
    return Promise.resolve(this.current);
  }
}

/** Les heures qui arrêtent le plan, sur les deux doublures ci-dessus. */
export function stopRulesOf(
  cutoffs: CutoffRules = new CutoffRules(),
  resupplyTime: ResupplyTime = new ResupplyTime(),
): PlanStopRules {
  return new PlanStopRules(cutoffs, resupplyTime);
}

/** Les réassorts du commerce, posés par le test ; `trace` reçoit chaque lecture. */
export class DayResupplies extends DayResuppliesReader {
  constructor(
    public current: readonly PlacedResupply[] = [],
    private readonly trace: string[] = [],
  ) {
    super();
  }

  placedFor(day: ServiceDay): Promise<readonly PlacedResupply[]> {
    this.trace.push(`resupplies:${day.value}`);
    return Promise.resolve(this.current);
  }
}
