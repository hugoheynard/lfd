import { OrderCutoffRulesReader } from "../../channels/commerce/order-cutoff-rules.reader.js";
import type {
  CloseSettingsValues,
  ProductionCloseSettings,
} from "../../domain/entities/production-close-settings.js";
import type { ProductionClosedDay } from "../../domain/entities/production-closed-day.js";
import { ProductionCloseSettingsRepository } from "../../domain/ports/production-close-settings.repository.js";
import { ProductionClosedDayRepository } from "../../domain/ports/production-closed-day.repository.js";
import { ProductionSettingsReader } from "../../domain/ports/production-settings.reader.js";
import type { OrderCutoffRule } from "../../domain/services/latest-order-cutoff.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Le réglage doublé : une « ligne », et le compte des écritures. */
export class SettingsTable extends ProductionCloseSettingsRepository {
  row: ProductionCloseSettings | null = null;
  saves = 0;

  load(): Promise<ProductionCloseSettings | null> {
    return Promise.resolve(this.row);
  }

  save(settings: ProductionCloseSettings): Promise<void> {
    this.row = settings;
    this.saves += 1;
    return Promise.resolve();
  }
}

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

/** La lecture, branchée sur les deux tables doublées. */
export class SettingsReader extends ProductionSettingsReader {
  constructor(
    private readonly settings: SettingsTable,
    private readonly closedDays: ClosedDaysTable,
  ) {
    super();
  }

  closeSettings(): Promise<CloseSettingsValues | null> {
    return Promise.resolve(this.settings.row?.values ?? null);
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
