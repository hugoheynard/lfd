import type { ModeDatesEntry } from "../domain/entities/billing-mode-dates-history.js";
import type { PayerModeEntry } from "../domain/entities/payer-billing-mode-history.js";
import {
  ModeDatesTimeline,
  type ModeDatesSegment,
} from "../domain/services/mode-dates-timeline.js";
import type { ModeTimelines, PayerModeSegment } from "../domain/services/payer-timeline.js";
import { billingModeOf, type BillingMode } from "../domain/value-objects/billing-mode.js";
import { BillingRhythm } from "../domain/value-objects/billing-rhythm.js";

/** Une ligne de `billing_mode_dates`, telle que Prisma la rend. */
export interface ModeDatesRow {
  readonly id: string;
  readonly mode: string;
  readonly effectiveFrom: Date;
  readonly days: readonly number[];
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
}

/** Une ligne de `payer_billing_mode`. */
export interface PayerModeRow {
  readonly id: string;
  readonly mode: string;
  readonly effectiveFrom: Date;
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
}

/** Ligne → segment ; les jours repassent par les factories (`fromRecord`). */
export function modeDatesEntryOf(row: ModeDatesRow): ModeDatesEntry {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    rhythm: BillingRhythm.fromRecord({ kind: row.mode, days: row.days }),
    createdAt: row.createdAt,
    createdByStaffId: row.createdByStaffId,
    cancelledAt: row.cancelledAt,
    cancelledByStaffId: row.cancelledByStaffId,
  };
}

export function payerModeEntryOf(row: PayerModeRow): PayerModeEntry {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    mode: billingModeOf(row.mode),
    createdAt: row.createdAt,
    createdByStaffId: row.createdByStaffId,
    cancelledAt: row.cancelledAt,
    cancelledByStaffId: row.cancelledByStaffId,
  };
}

/** Les lignes VIVANTES d'une entité → la timeline de chacun des trois modes. */
export function modeTimelinesOf(rows: readonly Omit<ModeDatesRow, "id">[]): ModeTimelines {
  const segmentsOf = (mode: BillingMode): ModeDatesSegment[] =>
    rows
      .filter((row) => row.mode === mode && row.cancelledAt === null)
      .map((row) => ({
        effectiveFrom: row.effectiveFrom,
        rhythm: BillingRhythm.fromRecord({ kind: row.mode, days: row.days }),
      }));
  const timelineOf = (mode: BillingMode): ModeDatesTimeline =>
    ModeDatesTimeline.of(mode, segmentsOf(mode));
  return {
    monthly: timelineOf("monthly"),
    semimonthly: timelineOf("semimonthly"),
    weekly: timelineOf("weekly"),
  };
}

/** Une ligne vivante de `payer_billing_mode` → un segment. */
export function payerModeSegmentOf(row: {
  readonly mode: string;
  readonly effectiveFrom: Date;
}): PayerModeSegment {
  return { effectiveFrom: row.effectiveFrom, mode: billingModeOf(row.mode) };
}
