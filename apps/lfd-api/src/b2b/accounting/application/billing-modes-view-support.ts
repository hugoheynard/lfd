import type {
  LegalEntityBillingModeView,
  PayerBillingModeView,
  UpcomingClosureView,
} from "@lfd/contracts";

import type { BillingModeDatesReader } from "../domain/ports/billing-mode-dates.reader.js";
import type {
  PayerBillingModesReader,
  PayerModeSegments,
} from "../domain/ports/payer-billing-modes.reader.js";
import { ClosureCalendar } from "../domain/services/closure-calendar.js";
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

/** Ce que les dates des modes lisent. */
export interface BillingModesReaders {
  readonly modeDates: BillingModeDatesReader;
  readonly payerModes: PayerBillingModesReader;
}

/** Les dates des trois modes, et la dernière clôture du calendrier de l'entité. */
export interface EntityBillingModes {
  readonly billingModes: readonly LegalEntityBillingModeView[];
  readonly lastClosure: string;
}

/**
 * Les modes de l'entité tels que la fiche les montre (§16.4), et la dernière
 * clôture atteinte de son calendrier (§16.3) : l'union des modes qu'au moins
 * un payeur suit (en vigueur ou programmé), plus le mensuel.
 */
export async function entityBillingModes(
  legalEntityId: string,
  readers: BillingModesReaders,
  now: Date,
): Promise<EntityBillingModes> {
  const modes = await readers.modeDates.timelinesOf(legalEntityId);
  const payers = await readers.payerModes.segmentsOf(legalEntityId);
  const followed = payers.map((payer) => PayerTimeline.of(payer.segments, modes).modesFrom(now));
  const calendar = ClosureCalendar.of(modes, followed.flat());
  return {
    billingModes: BILLING_MODES.map((mode) =>
      modeView(mode, modes[mode], payerCountOf(mode, followed), now),
    ),
    lastClosure: calendar.lastClosureAtOrBefore(now).toISOString(),
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
