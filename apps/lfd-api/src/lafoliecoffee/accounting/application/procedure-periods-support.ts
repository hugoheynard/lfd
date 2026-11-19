import type { CollectionProcedurePeriodView } from "@lfd/contracts";

import { periodLabelOf, previousClosureOf } from "../domain/services/invoicing-closures.js";
import type { ModeTimelines } from "../domain/services/payer-timeline.js";
import type { BillingMode } from "../domain/value-objects/billing-mode.js";

/**
 * La période que chaque rythme clôt à `closesAt`, de SA clôture précédente
 * à celle-ci. Une clôture mutualisée en a plusieurs (le mensuel du 1er au
 * 30, le « deux fois par mois » du 16 au 30) ; la clôture précédente du
 * calendrier, tous rythmes confondus, n'en dirait qu'un bout — au lendemain
 * d'une clôture hebdomadaire, « du 30 au 30 ».
 */
export function procedurePeriodsOf(
  closesAt: Date,
  modes: readonly BillingMode[],
  timelines: ModeTimelines,
): readonly CollectionProcedurePeriodView[] {
  return modes.map((mode) => ({
    mode,
    label: periodLabelOf({ startsAt: previousClosureOf(closesAt, timelines[mode]), closesAt }),
  }));
}
