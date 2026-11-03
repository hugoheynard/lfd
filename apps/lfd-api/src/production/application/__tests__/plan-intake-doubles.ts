import { FixedStaffAuthorDirectory } from "../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import type { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import type { Clock } from "../../../platform/time/clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../channels/commerce/day-orders.reader.js";
import { DayResuppliesReader } from "../../channels/commerce/day-resupplies.reader.js";
import { PendingSettlementSweeper } from "../../channels/commerce/pending-settlement.sweeper.js";
import { OrderWithdrawalsReader } from "../../domain/ports/order-withdrawals.reader.js";
import { ProductionDayStatusReader } from "../../domain/ports/production-day-status.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PlanArrestAdmission } from "../services/plan-arrest-admission.js";
import { PlanIntakeReading } from "../services/plan-intake-reading.js";
import { InMemoryWithdrawals } from "./withdrawal-doubles.js";
import { CutoffRules, DayResupplies, ResupplyTime, stopRulesOf } from "./settings-doubles.js";

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

/**
 * Un en-tête qui dit ce qu'on lui dit, quelle que soit la journée — l'en-tête
 * PÉRIMÉ d'une course : lu « arrêtée » hors verrou, la journée a été rouverte
 * avant que le verrou soit obtenu.
 */
export class FixedStatus extends ProductionDayStatusReader {
  constructor(
    private readonly closed: boolean,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  isClosed(): Promise<boolean> {
    this.trace.push("status");
    return Promise.resolve(this.closed);
  }
}

/** Ce qu'il faut pour lire l'arrêt et le retirage ; chaque pièce a un défaut vide. */
export interface IntakeParts {
  readonly days: ProductionDayRepository;
  readonly orders: DayOrdersReader;
  readonly withdrawals?: OrderWithdrawalsReader;
  readonly resupplies?: DayResuppliesReader;
}

/** La lecture sous verrou, montée sur des doublés. */
export function intakeReadingOf(parts: IntakeParts): PlanIntakeReading {
  return new PlanIntakeReading(
    parts.days,
    parts.orders,
    parts.withdrawals ?? new InMemoryWithdrawals(),
    parts.resupplies ?? new DayResupplies([]),
  );
}

/** Les commandes producibles du commerce, posées par le test ; `trace` reçoit chaque lecture. */
export class FixedDayOrders extends DayOrdersReader {
  constructor(
    private readonly rows: readonly ProducibleOrder[] = [],
    private readonly trace: string[] = [],
  ) {
    super();
  }

  producibleFor(day: ServiceDay): Promise<readonly ProducibleOrder[]> {
    this.trace.push(`orders:${day.value}`);
    return Promise.resolve(this.rows);
  }
}

/** Un balayage qui ne fait rien d'autre que se noter dans `trace`. */
export class SilentSweeper extends PendingSettlementSweeper {
  constructor(private readonly trace: string[] = []) {
    super();
  }

  sweep(day: ServiceDay): Promise<void> {
    this.trace.push(`sweep:${day.value}`);
    return Promise.resolve();
  }
}

/** Ce qu'il faut pour admettre un arrêt ; chaque pièce a un défaut neutre. */
export interface AdmissionParts {
  readonly days: ProductionDayRepository;
  readonly clock: Clock;
  readonly status?: ProductionDayStatusReader;
  readonly cutoffs?: CutoffRules;
  readonly resupplyTime?: ResupplyTime;
  readonly sweeper?: PendingSettlementSweeper;
  readonly authors?: StaffAuthorDirectory;
}

/** L'admission d'un arrêt, montée sur des doublés ; l'en-tête passe par le dépôt par défaut. */
export function admissionOf(parts: AdmissionParts): PlanArrestAdmission {
  return new PlanArrestAdmission(
    parts.status ?? new RepositoryBackedStatus(parts.days),
    stopRulesOf(parts.cutoffs, parts.resupplyTime),
    parts.sweeper ?? new SilentSweeper(),
    parts.authors ?? new FixedStaffAuthorDirectory(),
    parts.clock,
  );
}
