import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import { DayResuppliesReader } from "../../channels/commerce/day-resupplies.reader.js";
import { OrderWithdrawalsReader } from "../../domain/ports/order-withdrawals.reader.js";
import { ProductionDayStatusReader } from "../../domain/ports/production-day-status.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PlanIntakeReading } from "../services/plan-intake-reading.js";
import { InMemoryWithdrawals } from "./withdrawal-doubles.js";
import { DayResupplies } from "./settings-doubles.js";

/**
 * L'en-tête lu PAR le dépôt doublé : `isClosed` passe par `load`, comme la
 * lecture hors verrou d'avant le 2026-11-02. Les specs qui comptent les
 * `load` d'une séquence gardent ainsi leur trace ; celles qui veulent prouver
 * que l'en-tête seul est lu prennent un statut à part.
 */
export class RepositoryBackedStatus extends ProductionDayStatusReader {
  constructor(private readonly days: ProductionDayRepository) {
    super();
  }

  async isClosed(day: ServiceDay): Promise<boolean> {
    return (await this.days.load(day)).isClosed;
  }
}

/** Ce qu'il faut pour lire l'arrêt et le retirage ; chaque pièce a un défaut vide. */
export interface IntakeParts {
  readonly days: ProductionDayRepository;
  readonly orders: DayOrdersReader;
  readonly status?: ProductionDayStatusReader;
  readonly withdrawals?: OrderWithdrawalsReader;
  readonly resupplies?: DayResuppliesReader;
}

/** La lecture sous verrou, montée sur des doublés. */
export function intakeReadingOf(parts: IntakeParts): PlanIntakeReading {
  return new PlanIntakeReading(
    parts.days,
    parts.status ?? new RepositoryBackedStatus(parts.days),
    parts.orders,
    parts.withdrawals ?? new InMemoryWithdrawals(),
    parts.resupplies ?? new DayResupplies([]),
  );
}
