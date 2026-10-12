import type {
  LastClosurePeriodView,
  LegalEntityBillingModeView,
  PayerBillingModeView,
  UpcomingClosureView,
} from "@lfd/contracts";

import type { PayerModeSegments } from "../domain/ports/payer-billing-modes.reader.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { upcomingClosures } from "../domain/services/entity-closures.js";
import {
  lastDayOf,
  periodLabelOf,
  previousClosureOf,
  type RhythmTimeline,
} from "../domain/services/invoicing-closures.js";
import type { ModeDatesTimeline } from "../domain/services/mode-dates-timeline.js";
import { PayerTimeline, type ModeTimelines } from "../domain/services/payer-timeline.js";
import { BILLING_MODES, type BillingMode } from "../domain/value-objects/billing-mode.js";

/** Combien de prochaines clôtures l'écran annonce (plan `plan-rythme-de-facturation.md`, §6). */
export const UPCOMING_CLOSURES_SHOWN = 3;

/** Les dates des trois modes, et la dernière clôture du calendrier de l'entité. */
export interface EntityBillingModes {
  readonly billingModes: readonly LegalEntityBillingModeView[];
  readonly lastClosure: string;
  readonly lastClosurePeriod: LastClosurePeriodView;
}

/**
 * Les modes de l'entité tels que la fiche les montre (§16.4), et la dernière
 * clôture atteinte du calendrier de la facture (§16.3) — celui que suivent
 * aussi la facture et le lot depuis M3 (`InvoicingCalendar`).
 */
export function entityBillingModes(
  modes: ModeTimelines,
  payers: readonly PayerModeSegments[],
  calendar: InvoicingCalendar,
  now: Date,
): EntityBillingModes {
  const followed = payers.map((payer) => PayerTimeline.of(payer.segments, modes).modesFrom(now));
  return {
    billingModes: BILLING_MODES.map((mode) =>
      modeView(mode, modes[mode], payerCountOf(mode, followed), now),
    ),
    lastClosure: calendar.lastClosureAtOrBefore(now).toISOString(),
    lastClosurePeriod: lastClosurePeriodOf(calendar, now),
  };
}

/**
 * La période du lot à préparer (M4c) : la dernière clôture du calendrier et
 * la précédente — « du 1er au 4 octobre 2026 ». Sans modes : ceux d'un lot
 * sont ceux des clients qu'il prélève, que seule la lecture du lot connaît.
 */
function lastClosurePeriodOf(calendar: InvoicingCalendar, now: Date): LastClosurePeriodView {
  const cycle = calendar.cycleClosedAt(calendar.lastClosureAtOrBefore(now));
  return {
    closesAt: cycle.closesAt.toISOString(),
    startsAt: cycle.startsAt.toISOString(),
    label: periodLabelOf(cycle),
  };
}

/** Le mode d'un payeur, ses dates programmées et ses prochaines clôtures. */
export function payerBillingModeView(
  legalEntityId: string,
  payer: PayerModeSegments,
  modes: ModeTimelines,
  now: Date,
): PayerBillingModeView {
  const timeline = PayerTimeline.of(payer.segments, modes);
  const inForce = timeline.modeAt(now);
  const scheduled = timeline.scheduledAfter(now);
  return {
    legalEntityId,
    payerCompanyId: payer.payerCompanyId,
    mode: inForce.mode,
    since: inForce.since?.toISOString() ?? null,
    scheduled:
      scheduled === null
        ? null
        : { mode: scheduled.mode, effectiveAt: scheduled.effectiveFrom.toISOString() },
    changeLockedUntil: timeline.changeLockedUntil(now)?.toISOString() ?? null,
    upcomingClosures: upcomingViews(now, timeline),
  };
}

function modeView(
  mode: BillingMode,
  timeline: ModeDatesTimeline,
  payerCount: number,
  now: Date,
): LegalEntityBillingModeView {
  const inForce = timeline.inForceAt(now);
  const scheduled = timeline.scheduledAfter(now);
  return {
    mode,
    current: { days: [...inForce.rhythm.days], since: inForce.since?.toISOString() ?? null },
    scheduled:
      scheduled === null
        ? null
        : { days: [...scheduled.rhythm.days], effectiveAt: scheduled.effectiveFrom.toISOString() },
    changeLockedUntil: timeline.changeLockedUntil(now)?.toISOString() ?? null,
    upcomingClosures: upcomingViews(now, timeline),
    payerCount,
  };
}

function payerCountOf(mode: BillingMode, followed: readonly (readonly BillingMode[])[]): number {
  return followed.filter((modes) => modes.includes(mode)).length;
}

function upcomingViews(now: Date, timeline: RhythmTimeline): readonly UpcomingClosureView[] {
  return upcomingClosures(now, timeline, UPCOMING_CLOSURES_SHOWN).map((closesAt) => ({
    closesAt: closesAt.toISOString(),
    periodLabel: periodLabelOf({ startsAt: previousClosureOf(closesAt, timeline), closesAt }),
    invoicedOn: lastDayOf(closesAt),
  }));
}
