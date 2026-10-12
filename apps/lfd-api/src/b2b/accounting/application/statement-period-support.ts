import type { StatementCycleView } from "@lfd/contracts";

import type { Clock } from "../../../platform/time/clock.js";
import {
  InvalidStatementPeriodError,
  SeveralStatementIssuersError,
} from "../domain/errors/statement-errors.js";
import type { InvoiceIssuersReader } from "../domain/ports/invoice-issuers.reader.js";
import { sameBillingDates } from "../domain/services/entity-billing-dates.js";
import { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { ModeDatesTimeline } from "../domain/services/mode-dates-timeline.js";
import {
  currentStatementPeriod,
  requestedStatementPeriod,
  timelinePeriods,
  type StatementPeriod,
  type StatementPeriodSequence,
} from "../domain/services/statement-periods.js";
import { readBillingDates, type InvoicingCalendarReaders } from "./invoicing-calendar-support.js";

/** Ce qu'il faut pour savoir quelles périodes suit le relevé. */
export interface StatementRhythmDeps extends InvoicingCalendarReaders {
  readonly issuers: InvoiceIssuersReader;
}

/**
 * **Le calendrier que suit le relevé** : celui de l'entité émettrice en
 * service (plan `plan-rythme-de-facturation.md`, §16.9, lot M4a ; Q4 de
 * `lot-de-prelevement-fige.md` : une seule encaisse). Le relevé, le dossier et
 * le cycle courant ne nomment aucune entité — c'est celle en service qui fait
 * foi, comme pour le mandat (`soleIssuer`) et la facture (`soleSeller`).
 *
 * - Aucune entité en service : le calendrier d'une entité où rien n'est réglé
 *   (mensuel au 1er). Rien n'est alors ni facturé ni prélevé.
 * - Plusieurs, toutes aux mêmes dates : ces dates — rien n'est choisi.
 * - Plusieurs, à des dates différentes : refusé, plutôt que d'en choisir une.
 *
 * @throws {SeveralStatementIssuersError} plusieurs entités en service, à des dates différentes.
 */
export async function statementCalendar(deps: StatementRhythmDeps): Promise<InvoicingCalendar> {
  const active = await deps.issuers.activeIssuers();
  const dates = await Promise.all(
    active.map(({ legalEntityId }) => readBillingDates(deps, legalEntityId)),
  );
  const [first, ...others] = dates;
  if (first === undefined) {
    return InvoicingCalendar.following(ModeDatesTimeline.defaultOf("monthly"));
  }
  if (others.some((other) => !sameBillingDates(first, other))) {
    throw new SeveralStatementIssuersError(dates.length);
  }
  return InvoicingCalendar.of(first.modes, first.payers);
}

/**
 * **Les périodes d'un relevé** : celles du payeur nommé — sa `PayerTimeline`,
 * ou le mensuel s'il n'a rien choisi — ou, sans payeur, celles du calendrier
 * de l'entité (une période y va d'une clôture de n'importe quel payeur à la
 * suivante). Un site est lu comme payeur : il n'a de suite propre que s'il en
 * a choisi une quand il réglait seul.
 *
 * @throws {SeveralStatementIssuersError} plusieurs entités en service, à des dates différentes.
 */
export async function statementPeriodsOf(
  deps: StatementRhythmDeps,
  payerCompanyId: string | null,
): Promise<StatementPeriodSequence> {
  const calendar = await statementCalendar(deps);
  return payerCompanyId === null ? calendar : timelinePeriods(calendar.timelineOf(payerCompanyId));
}

/**
 * La période demandée (`periodClosesAt`, ISO) du payeur, ou celle en cours
 * si rien n'est demandé.
 *
 * @throws {InvalidStatementPeriodError} la chaîne n'est pas un instant.
 * @throws {NotAStatementPeriodError} l'instant n'est pas une clôture du payeur.
 * @throws {FutureStatementPeriodError} la période n'a pas commencé.
 * @throws {SeveralStatementIssuersError} plusieurs entités sont en service.
 */
export async function resolveStatementPeriod(
  deps: StatementRhythmDeps & { readonly clock: Clock },
  payerCompanyId: string,
  requested: string | undefined,
): Promise<StatementPeriod> {
  const now = deps.clock.now();
  const periods = await statementPeriodsOf(deps, payerCompanyId);
  if (requested === undefined) {
    return currentStatementPeriod(now, periods);
  }
  const closesAt = new Date(requested);
  if (Number.isNaN(closesAt.getTime())) {
    throw new InvalidStatementPeriodError(requested);
  }
  return requestedStatementPeriod(closesAt, now, periods);
}

/** La période telle que le contrat la porte — partagée par le relevé, le dossier et le sélecteur. */
export function statementCycleView(period: StatementPeriod): StatementCycleView {
  return {
    periodClosesAt: period.cycle.closesAt.toISOString(),
    periodStartsAt: period.cycle.startsAt.toISOString(),
    periodLabel: period.label,
    inProgress: period.inProgress,
  };
}
