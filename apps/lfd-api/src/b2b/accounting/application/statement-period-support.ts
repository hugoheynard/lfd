import type { StatementCycleView } from "@lfd/contracts";

import type { Clock } from "../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import {
  InvalidStatementPeriodError,
  SeveralStatementIssuersError,
} from "../domain/errors/statement-errors.js";
import type { BillingRhythmReader } from "../domain/ports/billing-rhythm.reader.js";
import type { InvoiceIssuersReader } from "../domain/ports/invoice-issuers.reader.js";
import type { RhythmTimeline } from "../domain/services/invoicing-closures.js";
import {
  currentStatementPeriod,
  requestedStatementPeriod,
  type StatementPeriod,
} from "../domain/services/statement-periods.js";
import { ModeDatesTimeline } from "../domain/services/mode-dates-timeline.js";

/** Ce qu'il faut pour savoir quel rythme suit le relevé. */
export interface StatementRhythmDeps {
  readonly issuers: InvoiceIssuersReader;
  readonly rhythms: BillingRhythmReader;
}

/**
 * **Le rythme que suit le relevé** : celui de l'entité émettrice en service
 * — ⚠️ en M1, la timeline de son MODE MENSUEL (`BillingRhythmReader`,
 * adaptateur de transition ; M4 passera aux périodes du payeur)
 * (plan `plan-rythme-de-facturation.md`, §14 ; Q4 de `lot-de-prelevement-fige.md` :
 * une seule encaisse). Le relevé, le dossier et le cycle courant ne nomment
 * aucune entité — c'est celle en service qui fait foi, comme pour le mandat
 * (`soleIssuer`) et la facture (`soleSeller`).
 *
 * - Aucune entité en service : le rythme de toute entité qui n'a rien réglé
 *   (mensuel au 1er). Rien n'est alors ni facturé ni prélevé, et le relevé
 *   reste ce qu'il était avant R5 — une lecture des bons par mois civil.
 * - Plusieurs, toutes au même réglage : ce réglage — rien n'est choisi, et le
 *   dossier peut encore dire « plusieurs entités » comme un manque.
 * - Plusieurs, à des réglages différents : refusé, plutôt que d'en choisir un.
 *
 * @throws {SeveralStatementIssuersError} plusieurs entités en service, à des rythmes différents.
 * @throws {LegalEntityNotFoundError} une entité a disparu entre deux lectures.
 */
export async function statementTimeline(deps: StatementRhythmDeps): Promise<RhythmTimeline> {
  const active = await deps.issuers.activeIssuers();
  const timelines = await Promise.all(
    active.map(async ({ legalEntityId }) => {
      const timeline = await deps.rhythms.timelineOf(legalEntityId);
      if (timeline === null) {
        throw new LegalEntityNotFoundError(legalEntityId);
      }
      return timeline;
    }),
  );
  const [first, ...others] = timelines;
  if (first === undefined) {
    return ModeDatesTimeline.defaultOf("monthly");
  }
  if (others.some((other) => !first.equals(other))) {
    throw new SeveralStatementIssuersError(timelines.length);
  }
  return first;
}

/**
 * La période demandée (`periodClosesAt`, ISO), ou celle en cours si rien
 * n'est demandé.
 *
 * @throws {InvalidStatementPeriodError} la chaîne n'est pas un instant.
 * @throws {NotAStatementPeriodError} l'instant n'est pas une clôture de l'entité.
 * @throws {FutureStatementPeriodError} la période n'a pas commencé.
 * @throws {SeveralStatementIssuersError} plusieurs entités sont en service.
 */
export async function resolveStatementPeriod(
  deps: StatementRhythmDeps & { readonly clock: Clock },
  requested: string | undefined,
): Promise<StatementPeriod> {
  const now = deps.clock.now();
  const timeline = await statementTimeline(deps);
  if (requested === undefined) {
    return currentStatementPeriod(now, timeline);
  }
  const closesAt = new Date(requested);
  if (Number.isNaN(closesAt.getTime())) {
    throw new InvalidStatementPeriodError(requested);
  }
  return requestedStatementPeriod(closesAt, now, timeline);
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
