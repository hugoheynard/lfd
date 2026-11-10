import {
  BillingModeDatesChangePendingError,
  NoScheduledBillingModeDatesError,
} from "../../errors/billing-mode-errors.js";
import { InvalidBillingRhythmError } from "../../errors/billing-rhythm-errors.js";
import { paris } from "../../services/__tests__/billing-mode-fixtures.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { BillingModeDatesHistory, type ModeDatesEntry } from "../billing-mode-dates-history.js";

const gesture = (at: Date, segmentId = "seg_new") => ({ segmentId, at, staffId: "staff_1" });

function entry(effectiveFrom: Date, days: number, cancelledAt: Date | null = null): ModeDatesEntry {
  return {
    id: `seg_${effectiveFrom.toISOString()}`,
    effectiveFrom,
    rhythm: BillingRhythm.monthly(days),
    createdAt: paris("2026-10-01"),
    createdByStaffId: "staff_0",
    cancelledAt,
    cancelledByStaffId: cancelledAt === null ? null : "staff_0",
  };
}

const empty = (): BillingModeDatesHistory =>
  BillingModeDatesHistory.reconstitute("le1", "monthly", []);

describe("BillingModeDatesHistory — un seul changement à la fois, au temps (§16.6-2)", () => {
  it("programme à la prochaine clôture du mode, jamais à l'instant du geste", () => {
    const history = empty();

    const change = history.schedule([15], gesture(paris("2026-10-08", "12:00")));

    expect(change).toEqual({
      kind: "scheduled",
      mode: "monthly",
      from: BillingRhythm.monthly(1),
      to: BillingRhythm.monthly(15),
      effectiveAt: paris("2026-11-01"),
    });
    expect(history.toPersistence()).toMatchObject({ freshIds: ["seg_new"], cancelledIds: [] });
    expect(history.timeline().scheduledAfter(paris("2026-10-08"))?.rhythm).toEqual(
      BillingRhythm.monthly(15),
    );
  });

  it("les dates en vigueur redemandées : rien, ni segment ni fait", () => {
    const history = empty();
    expect(history.schedule([1], gesture(paris("2026-10-08")))).toBeNull();
    expect(history.toPersistence().freshIds).toEqual([]);
  });

  it("refuse un second changement tant que le premier n'a pas pris effet, en nommant la date et le geste", () => {
    const history = BillingModeDatesHistory.reconstitute("le1", "monthly", [
      entry(paris("2026-11-01"), 15),
    ]);

    const attempt = (): unknown => history.schedule([10], gesture(paris("2026-10-20")));

    expect(attempt).toThrow(BillingModeDatesChangePendingError);
    expect(attempt).toThrow(/1er novembre 2026 à 00h00.*annulez d'abord le changement programmé/su);
    expect(history.toPersistence().freshIds).toEqual([]);
  });

  it("à l'instant exact de la prise d'effet, encore refusé (≥ maintenant)", () => {
    const history = BillingModeDatesHistory.reconstitute("le1", "monthly", [
      entry(paris("2026-11-01"), 15),
    ]);
    expect(() => history.schedule([10], gesture(paris("2026-11-01")))).toThrow(
      BillingModeDatesChangePendingError,
    );
  });

  it("une fois la prise d'effet passée, le suivant part de la timeline ACTUELLE", () => {
    const history = BillingModeDatesHistory.reconstitute("le1", "monthly", [
      entry(paris("2026-11-01"), 15),
    ]);

    const change = history.schedule([20], gesture(paris("2026-11-03")));

    expect(change).toMatchObject({
      from: BillingRhythm.monthly(15),
      to: BillingRhythm.monthly(20),
      effectiveAt: paris("2026-11-15"),
    });
  });

  it("un segment annulé ne bloque pas et ne compte pas", () => {
    const history = BillingModeDatesHistory.reconstitute("le1", "monthly", [
      entry(paris("2026-11-01"), 15, paris("2026-10-05")),
    ]);

    expect(history.schedule([10], gesture(paris("2026-10-08")))).toMatchObject({
      from: BillingRhythm.monthly(1),
      effectiveAt: paris("2026-11-01"),
    });
  });

  it("annule le programmé avant sa prise d'effet : la ligne reste, annulée, et le mode redevient libre", () => {
    const history = BillingModeDatesHistory.reconstitute("le1", "monthly", [
      entry(paris("2026-11-01"), 15),
    ]);

    const change = history.cancelScheduled({ at: paris("2026-10-20"), staffId: "staff_2" });

    expect(change).toEqual({
      kind: "cancelled",
      mode: "monthly",
      from: BillingRhythm.monthly(15),
      to: BillingRhythm.monthly(1),
      effectiveAt: paris("2026-11-01"),
    });
    const record = history.toPersistence();
    expect(record.entries).toHaveLength(1);
    expect(record.entries[0]).toMatchObject({
      cancelledAt: paris("2026-10-20"),
      cancelledByStaffId: "staff_2",
    });
    expect(record.cancelledIds).toEqual([record.entries[0]?.id]);
    expect(history.schedule([10], gesture(paris("2026-10-20")))).not.toBeNull();
  });

  it("refuse d'annuler quand rien n'est programmé, ou quand la prise d'effet est atteinte", () => {
    expect(() => empty().cancelScheduled({ at: paris("2026-10-20"), staffId: "s" })).toThrow(
      NoScheduledBillingModeDatesError,
    );
    const taken = BillingModeDatesHistory.reconstitute("le1", "monthly", [
      entry(paris("2026-11-01"), 15),
    ]);
    expect(() => taken.cancelScheduled({ at: paris("2026-11-01"), staffId: "s" })).toThrow(
      NoScheduledBillingModeDatesError,
    );
  });

  it("refuse des jours hors bornes ou en nombre faux pour le mode", () => {
    expect(() => empty().schedule([29], gesture(paris("2026-10-08")))).toThrow(
      InvalidBillingRhythmError,
    );
    const semimonthly = BillingModeDatesHistory.reconstitute("le1", "semimonthly", []);
    expect(() => semimonthly.schedule([1], gesture(paris("2026-10-08")))).toThrow(/il en faut 2/u);
  });

  it("refuse de relire un segment d'un autre mode", () => {
    expect(() =>
      BillingModeDatesHistory.reconstitute("le1", "weekly", [entry(paris("2026-11-01"), 15)]),
    ).toThrow(InvalidBillingRhythmError);
  });
});
