import type { CollectionProcedureMissedView } from "@lfd/contracts";

import type { AutopilotCoverageReader } from "../domain/ports/autopilot-coverage.reader.js";
import type { CollectionCalendarSettings } from "../domain/services/collection-calendar.js";
import { closureDayOf, procedureIdOf } from "../domain/services/collection-procedure-id.js";
import type { ClosureToCome } from "../domain/services/collection-procedure-list.js";
import { closureToCome } from "./collection-procedure-list-support.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { periodLabelOf } from "../domain/services/invoicing-closures.js";
import { missedClosures } from "../domain/services/missed-closures.js";

/**
 * Les clôtures manquées d'une entité à `now`, par la règle de l'automatisme
 * (`missedClosures`, R4b) — la même borne, la même couverture : la table des
 * procédures et leur détail ne la refont pas. `current` est la dernière
 * clôture passée, celle que « Préparer » préparerait.
 */
export async function readMissedClosures(
  coverage: AutopilotCoverageReader,
  legalEntityId: string,
  calendar: InvoicingCalendar,
  now: Date,
): Promise<readonly Date[]> {
  const current = calendar.lastClosureAtOrBefore(now);
  return missedClosures(current, calendar, await coverage.coverageOf(legalEntityId, current));
}

/** Les mêmes, avec les jalons de leur calendrier — les lignes manquées de la table. */
export async function missedClosuresToCome(
  coverage: AutopilotCoverageReader,
  legalEntityId: string,
  calendar: InvoicingCalendar,
  settings: CollectionCalendarSettings,
  now: Date,
): Promise<readonly ClosureToCome[]> {
  const missed = await readMissedClosures(coverage, legalEntityId, calendar, now);
  return missed.map((closesAt) =>
    closureToCome(calendar, closesAt, settings, calendar.modesClosingAt(closesAt)),
  );
}

/**
 * Le détail d'une procédure manquée : la clôture de l'adresse, et la
 * dernière clôture, dont le lot reprend ses commandes. `null` si la clôture
 * de l'adresse n'est pas manquée — ou si l'adresse n'en désigne aucune.
 */
export async function readMissedProcedure(
  coverage: AutopilotCoverageReader,
  legalEntityId: string,
  calendar: InvoicingCalendar,
  closureDay: string | null,
  now: Date,
): Promise<CollectionProcedureMissedView | null> {
  if (closureDay === null) {
    return null;
  }
  const missed = (await readMissedClosures(coverage, legalEntityId, calendar, now)).find(
    (closesAt) => closureDayOf(closesAt) === closureDay,
  );
  if (missed === undefined) {
    return null;
  }
  const latest = calendar.lastClosureAtOrBefore(now);
  return {
    closesAt: missed.toISOString(),
    periodLabel: periodLabelOf(calendar.cycleClosedAt(missed)),
    latestProcedureId: procedureIdOf(legalEntityId, latest),
    latestPeriodLabel: periodLabelOf(calendar.cycleClosedAt(latest)),
  };
}
