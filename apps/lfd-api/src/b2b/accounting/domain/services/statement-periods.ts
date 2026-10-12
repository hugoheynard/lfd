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
 * §13-14, lot R5) : le relevé et le dossier de facturation suivent des
 * clôtures, plus les mois civils — depuis M4a (§16.9), celles du PAYEUR.
 *
 * Une période est `[clôture précédente réelle, clôture[` — la même que la
 * facture (`invoicedPeriodOf`), bascule de rythme comprise. Le mensuel au 1er
 * rend exactement les mois civils d'avant R5.
 *
 * Pur : l'instant, la suite et la mise en service sont donnés.
 */

/**
 * Une suite de périodes : ce que le relevé demande à la suite qu'il lit (lot
 * M4a). Celle d'un PAYEUR (`timelinePeriods` sur sa `PayerTimeline`) pour le
 * relevé et le dossier ; le calendrier de la facture (`InvoicingCalendar`)
 * quand aucun payeur n'est nommé. Une période est `[closureBefore(C), C[`.
 */
export interface StatementPeriodSequence {
  /** La prochaine clôture, strictement après `instant`. */
  closureAfter(instant: Date): Date;
  /** La clôture qui ouvre la période close à `closesAt` — la précédente réelle. */
  closureBefore(closesAt: Date): Date;
}

/** La suite des périodes d'une timeline (un payeur, un mode). */
export function timelinePeriods(timeline: RhythmTimeline): StatementPeriodSequence {
  return {
    closureAfter: (instant) => closureAfter(instant, timeline),
    closureBefore: (closesAt) => previousClosureOf(closesAt, timeline),
  };
}

/** Au plus tant de périodes proposées au sélecteur ; au-delà, `?periodClosesAt=`. */
export const STATEMENT_PERIODS_LISTED = 12;

/** Une période de relevé, son libellé, et si elle accumule encore. */
export interface StatementPeriod {
  readonly cycle: BillingCycle;
  readonly label: string;
  readonly inProgress: boolean;
}

/** La période qui contient `now`. */
export function currentStatementPeriod(
  now: Date,
  sequence: StatementPeriodSequence,
): StatementPeriod {
  return periodClosedBy(sequence.closureAfter(now), sequence, true);
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
  sequence: StatementPeriodSequence,
): StatementPeriod {
  const current = sequence.closureAfter(now);
  const period = periodClosedBy(closesAt, sequence, closesAt.getTime() === current.getTime());
  if (sequence.closureAfter(period.cycle.startsAt).getTime() !== closesAt.getTime()) {
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
  sequence: StatementPeriodSequence,
  floor: Date | null,
): readonly StatementPeriod[] {
  const current = currentStatementPeriod(now, sequence);
  const periods: StatementPeriod[] = [current];
  let closesAt = current.cycle.startsAt;
  while (
    periods.length < STATEMENT_PERIODS_LISTED &&
    (floor === null || closesAt.getTime() > floor.getTime())
  ) {
    periods.push(periodClosedBy(closesAt, sequence, false));
    closesAt = sequence.closureBefore(closesAt);
  }
  return periods;
}

function periodClosedBy(
  closesAt: Date,
  sequence: StatementPeriodSequence,
  inProgress: boolean,
): StatementPeriod {
  const cycle = { startsAt: sequence.closureBefore(closesAt), closesAt };
  return { cycle, label: periodLabelOf(cycle), inProgress };
}
