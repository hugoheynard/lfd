import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { instantToLocal, type BillingRhythmsCalendarView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import type { CollectionCalendarSettings } from "../../domain/services/collection-calendar.js";
import { PayerTimeline } from "../../domain/services/payer-timeline.js";
import {
  rhythmCalendarWindowAt,
  rhythmPeriodsIn,
} from "../../domain/services/rhythm-calendar-window.js";
import { DEFAULT_BILLING_MODE, type BillingMode } from "../../domain/value-objects/billing-mode.js";
import { GetBillingRhythmsCalendarQuery } from "./get-billing-rhythms-calendar.query.js";

/** L'ordre de l'écran : du plus fréquent au plus rare. */
const LANE_ORDER: readonly BillingMode[] = ["weekly", "semimonthly", "monthly"];

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
    private readonly clock: Clock,
  ) {}

  async execute(query: GetBillingRhythmsCalendarQuery): Promise<BillingRhythmsCalendarView> {
    const entity = await this.entities.byId(query.legalEntityId);
    if (entity === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }
    const now = this.clock.now();
    const [modes, payers] = await Promise.all([
      this.modeDates.timelinesOf(entity.id),
      this.payerModes.segmentsOf(entity.id),
    ]);
    const inForce = payers.map((payer) => PayerTimeline.of(payer.segments, modes).modeAt(now));
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
        const payerCount = inForce.filter(
          (current) => current.mode === mode && current.since !== null,
        ).length;
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
