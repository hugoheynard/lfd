import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { instantToLocal, type BillingRhythmsCalendarView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import {
  PayerBillingModesReader,
  type PayerModeSegments,
} from "../../domain/ports/payer-billing-modes.reader.js";
import { PayerStandingsReader } from "../../domain/ports/payer-standings.reader.js";
import { isBillingPayerAt } from "../../domain/services/billing-payer-guard.js";
import type { CollectionCalendarSettings } from "../../domain/services/collection-calendar.js";
import { PayerTimeline, type ModeTimelines } from "../../domain/services/payer-timeline.js";
import {
  rhythmCalendarWindowAt,
  rhythmPeriodsIn,
} from "../../domain/services/rhythm-calendar-window.js";
import { DEFAULT_BILLING_MODE, type BillingMode } from "../../domain/value-objects/billing-mode.js";
import { GetBillingRhythmsCalendarQuery } from "./get-billing-rhythms-calendar.query.js";

/** L'ordre de l'écran : du plus fréquent au plus rare. */
const LANE_ORDER: readonly BillingMode[] = ["weekly", "semimonthly", "monthly"];

/**
 * Combien de clients suivent chaque mode à `now`. Hebdomadaire et deux fois
 * par mois : les payeurs qui l'ont choisi et chez qui il est en vigueur.
 * Mensuel : TOUS les payeurs (`isBillingPayerAt`, le critère qui autorise à
 * poser un mode) dont le mode en vigueur est le mensuel, choisi ou par défaut.
 */
function payerCountsAt(
  modes: ModeTimelines,
  chosen: readonly PayerModeSegments[],
  payerIds: readonly string[],
  now: Date,
): ReadonlyMap<BillingMode, number> {
  const inForce = new Map(
    chosen.map((payer) => [
      payer.payerCompanyId,
      PayerTimeline.of(payer.segments, modes).modeAt(now),
    ]),
  );
  const counts = new Map<BillingMode, number>();
  for (const current of inForce.values()) {
    if (current.mode !== DEFAULT_BILLING_MODE) {
      counts.set(current.mode, (counts.get(current.mode) ?? 0) + 1);
    }
  }
  const monthly = payerIds.filter(
    (id) => (inForce.get(id)?.mode ?? DEFAULT_BILLING_MODE) === DEFAULT_BILLING_MODE,
  ).length;
  return counts.set(DEFAULT_BILLING_MODE, monthly);
}

/**
 * Les trois rythmes d'une entité sur un même axe : pour chacun, ses clôtures
 * (et la facture de la veille), l'avis de prélèvement et l'échéance.
 *
 * Tout vient du code du lot : la suite des clôtures de chaque mode
 * (`ModeDatesTimeline`, dates programmées comprises), et les jalons de
 * `collectionCalendar` sous les réglages de l'entité. Un rythme que personne
 * ne suit a quand même ses dates — l'écran le montre éteint, pas absent.
 */
@QueryHandler(GetBillingRhythmsCalendarQuery)
export class GetBillingRhythmsCalendarHandler implements IQueryHandler<
  GetBillingRhythmsCalendarQuery,
  BillingRhythmsCalendarView
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly standings: PayerStandingsReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetBillingRhythmsCalendarQuery): Promise<BillingRhythmsCalendarView> {
    const entity = await this.entities.byId(query.legalEntityId);
    if (entity === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }
    const now = this.clock.now();
    const [modes, chosen, standings] = await Promise.all([
      this.modeDates.timelinesOf(entity.id),
      this.payerModes.segmentsOf(entity.id),
      this.standings.allAt(now),
    ]);
    const counts = payerCountsAt(
      modes,
      chosen,
      standings.filter((s) => isBillingPayerAt(s, now)).map((s) => s.companyId),
      now,
    );
    const settings: CollectionCalendarSettings = {
      preNotificationDays: entity.preNotificationDays,
      collectionDaysAfterClosure: entity.collectionDaysAfterClosure,
      autoCollectionDelayHours: entity.autoCollectionDelayHours,
      depositCutoff: entity.depositCutoff,
    };
    const window = rhythmCalendarWindowAt(now);
    return {
      legalEntityId: entity.id,
      today: instantToLocal(now).day,
      startsOn: window.startsOn,
      endsOn: window.endsOn,
      preNotificationDays: entity.preNotificationDays,
      rhythms: LANE_ORDER.map((mode) => {
        const payerCount = counts.get(mode) ?? 0;
        return {
          mode,
          followed: mode === DEFAULT_BILLING_MODE || payerCount > 0,
          payerCount,
          periods: rhythmPeriodsIn(window, modes[mode], settings).map((period) => ({
            ...period,
            closesAt: period.closesAt.toISOString(),
          })),
        };
      }),
    };
  }
}
