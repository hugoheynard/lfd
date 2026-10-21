import { OrderCutoffRulesReader } from "../../channels/commerce/order-cutoff-rules.reader.js";
import type { ProductionClosedDay } from "../../domain/entities/production-closed-day.js";
import { ProductionClosedDayRepository } from "../../domain/ports/production-closed-day.repository.js";
import { ProductionSettingsReader } from "../../domain/ports/production-settings.reader.js";
import type { OrderCutoffRule } from "../../domain/services/latest-order-cutoff.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

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
