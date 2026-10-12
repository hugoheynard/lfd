import {
  FutureStatementPeriodError,
  NotAStatementPeriodError,
} from "../errors/statement-errors.js";
import type { BillingCycle } from "./billing-cycle.js";
import {
  closureAfter,
  periodLabelOf,
  previousClosureOf,
  type RhythmTimeline,
} from "./invoicing-closures.js";

/**
 * **Les périodes du relevé** (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §13-14, lot R5) : le relevé et le dossier de facturation suivent les
 * clôtures du rythme de l'entité, plus les mois civils.
 *
 * Une période est `[clôture précédente réelle, clôture[` — la même que la
 * facture (`invoicedPeriodOf`), bascule de rythme comprise. Le mensuel au 1er
 * rend exactement les mois civils d'avant R5.
 *
 * Pur : l'instant, le rythme et la mise en service sont donnés.
 */

/** Au plus tant de périodes proposées au sélecteur ; au-delà, `?periodClosesAt=`. */
export const STATEMENT_PERIODS_LISTED = 12;

/** Une période de relevé, son libellé, et si elle accumule encore. */
export interface StatementPeriod {
  readonly cycle: BillingCycle;
  readonly label: string;
  readonly inProgress: boolean;
}

/** La période qui contient `now`. */
export function currentStatementPeriod(now: Date, timeline: RhythmTimeline): StatementPeriod {
  return periodClosedBy(closureAfter(now, timeline), timeline, true);
}

/**
 * La période close à `closesAt`, demandée par le sélecteur.
 *
 * @throws {NotAStatementPeriodError} `closesAt` n'est pas une clôture de l'entité.
 * @throws {FutureStatementPeriodError} la période n'a pas commencé à `now`.
 */
export function requestedStatementPeriod(
  closesAt: Date,
  now: Date,
  timeline: RhythmTimeline,
): StatementPeriod {
  const current = closureAfter(now, timeline);
  const period = periodClosedBy(closesAt, timeline, closesAt.getTime() === current.getTime());
  if (closureAfter(period.cycle.startsAt, timeline).getTime() !== closesAt.getTime()) {
    throw new NotAStatementPeriodError(closesAt);
  }
  if (closesAt.getTime() > current.getTime()) {
    throw new FutureStatementPeriodError(period.label);
  }
  return period;
}

/**
 * Les périodes proposées, la plus récente d'abord : celle en cours, puis
 * celles qui se sont closes APRÈS la mise en service de la facture par
 * période (`floor`) — une période close avant n'a été ni facturée ni
 * prélevée par période. Au plus {@link STATEMENT_PERIODS_LISTED}. Sans
 * mise en service connue, les douze dernières.
 */
export function listedStatementPeriods(
  now: Date,
  timeline: RhythmTimeline,
  floor: Date | null,
): readonly StatementPeriod[] {
  const current = currentStatementPeriod(now, timeline);
  const periods: StatementPeriod[] = [current];
  let closesAt = current.cycle.startsAt;
  while (
    periods.length < STATEMENT_PERIODS_LISTED &&
    (floor === null || closesAt.getTime() > floor.getTime())
  ) {
    periods.push(periodClosedBy(closesAt, timeline, false));
    closesAt = previousClosureOf(closesAt, timeline);
  }
  return periods;
}

function periodClosedBy(
  closesAt: Date,
  timeline: RhythmTimeline,
  inProgress: boolean,
): StatementPeriod {
  const cycle = { startsAt: previousClosureOf(closesAt, timeline), closesAt };
  return { cycle, label: periodLabelOf(cycle), inProgress };
}
