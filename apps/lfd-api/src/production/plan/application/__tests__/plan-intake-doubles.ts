import { FixedStaffAuthorDirectory } from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import type { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import type { Clock } from "../../../../platform/time/clock.js";
import type { DayOrdersReader } from "../../../channels/commerce/day-orders.reader.js";
import type { DayResuppliesReader } from "../../../channels/commerce/day-resupplies.reader.js";
import type { PendingSettlementSweeper } from "../../../channels/commerce/pending-settlement.sweeper.js";
import type {
  OrderWithdrawalsReader,
  ProductionDayRepository,
  ProductionDayStatusReader,
} from "../../../day/index.js";
import { PlanArrestAdmission } from "../services/plan-arrest-admission.js";
import { PlanIntakeReading } from "../services/plan-intake-reading.js";
import { InMemoryWithdrawals } from "../../../day/application/__tests__/withdrawal-doubles.js";
import { RepositoryBackedStatus } from "../../../day/application/__tests__/day-status-doubles.js";
import { SilentSweeper } from "../../../channels/commerce/__tests__/day-orders-doubles.js";
import type {
  CutoffRules,
  ResupplyTime,
} from "../../../channels/commerce/__tests__/order-cutoff-doubles.js";
import { DayResupplies } from "../../../channels/commerce/__tests__/day-resupplies-doubles.js";
import { FixedReopenRelease } from "../../../channels/commerce/__tests__/reopen-release-doubles.js";
import type { ReopenReleasePending } from "../../../channels/commerce/reopen-release.pending.js";
import { stopRulesOf } from "./settings-doubles.js";

/** Ce qu'il faut pour lire l'arrêt et le retirage ; chaque pièce a un défaut vide. */
export interface IntakeParts {
  readonly days: ProductionDayRepository;
  readonly orders: DayOrdersReader;
  readonly withdrawals?: OrderWithdrawalsReader;
  readonly resupplies?: DayResuppliesReader;
  /** La remise de la réouverture ; par défaut, faite. */
  readonly releases?: ReopenReleasePending;
}

/** La lecture sous verrou, montée sur des doublés. */
export function intakeReadingOf(parts: IntakeParts): PlanIntakeReading {
  return new PlanIntakeReading(
    parts.days,
    parts.orders,
    parts.withdrawals ?? new InMemoryWithdrawals(),
    parts.resupplies ?? new DayResupplies([]),
    parts.releases ?? new FixedReopenRelease(),
  );
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
