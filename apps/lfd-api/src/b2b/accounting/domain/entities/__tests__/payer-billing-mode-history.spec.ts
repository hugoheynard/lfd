import {
  NoScheduledPayerBillingModeError,
  PayerBillingModeChangePendingError,
} from "../../errors/billing-mode-errors.js";
import { defaultModes, paris } from "../../services/__tests__/billing-mode-fixtures.js";
import { ModeDatesTimeline } from "../../services/mode-dates-timeline.js";
import type { BillingMode } from "../../value-objects/billing-mode.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { PayerBillingModeHistory, type PayerModeEntry } from "../payer-billing-mode-history.js";

const PAYER = { id: "cmp_1", name: "Le Bistrot" };
const gesture = (at: Date) => ({ segmentId: "seg_new", at, staffId: "staff_1" });

function entry(effectiveFrom: Date, mode: BillingMode): PayerModeEntry {
  return {
    id: `seg_${effectiveFrom.toISOString()}`,
    effectiveFrom,
    mode,
    createdAt: paris("2026-10-01"),
    createdByStaffId: "staff_0",
    cancelledAt: null,
    cancelledByStaffId: null,
  };
}

const history = (entries: readonly PayerModeEntry[] = []): PayerBillingModeHistory =>
  PayerBillingModeHistory.reconstitute("le1", PAYER, entries);

describe("PayerBillingModeHistory — le mode d'un payeur (§16.1, §16.6)", () => {
  it("mensuel par défaut → hebdomadaire à la prochaine clôture du mensuel", () => {
    const payer = history();

    expect(payer.change("weekly", gesture(paris("2026-10-08")), defaultModes())).toEqual({
      kind: "scheduled",
      from: "monthly",
      to: "weekly",
      effectiveAt: paris("2026-11-01"),
    });
    expect(payer.toPersistence().freshIds).toEqual(["seg_new"]);
  });

  it("son mode redemandé : rien", () => {
    expect(history().change("monthly", gesture(paris("2026-10-08")), defaultModes())).toBeNull();
  });

  it("refuse un second changement avant la prise d'effet, en nommant le payeur et la date", () => {
    const payer = history([entry(paris("2026-11-01"), "weekly")]);
    const attempt = (): unknown =>
      payer.change("semimonthly", gesture(paris("2026-10-20")), defaultModes());

    expect(attempt).toThrow(PayerBillingModeChangePendingError);
    expect(attempt).toThrow(/« Le Bistrot ».*1er novembre 2026.*annulez d'abord/su);
  });

  it("la prise d'effet suit sa timeline ACTUELLE : hebdomadaire depuis le 1er, le lundi suivant", () => {
    const payer = history([entry(paris("2026-11-01"), "weekly")]);

    expect(payer.change("monthly", gesture(paris("2026-11-03")), defaultModes())).toMatchObject({
      from: "weekly",
      effectiveAt: paris("2026-11-09"),
    });
  });

  it("…et les dates déjà basculées de son mode", () => {
    const modes = defaultModes({
      monthly: ModeDatesTimeline.of("monthly", [
        { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.monthly(15) },
      ]),
    });

    expect(history().change("weekly", gesture(paris("2026-11-03")), modes)).toMatchObject({
      effectiveAt: paris("2026-11-15"),
    });
  });

  it("des dates programmées de son mode prennent effet à SA prochaine clôture : le payeur bascule au même instant", () => {
    // Le programmé tombe sur une clôture de la suite actuelle : il ne la déplace pas.
    const modes = defaultModes({
      monthly: ModeDatesTimeline.of("monthly", [
        { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.monthly(15) },
      ]),
    });
    expect(history().change("weekly", gesture(paris("2026-10-08")), modes)).toMatchObject({
      effectiveAt: paris("2026-11-01"),
    });
  });

  it("annule le programmé : le mode d'avant reste, la ligne aussi", () => {
    const payer = history([
      entry(paris("2026-11-01"), "weekly"),
      entry(paris("2026-12-07"), "semimonthly"),
    ]);

    expect(payer.cancelScheduled({ at: paris("2026-11-20"), staffId: "staff_2" })).toEqual({
      kind: "cancelled",
      from: "semimonthly",
      to: "weekly",
      effectiveAt: paris("2026-12-07"),
    });
    expect(payer.toPersistence().entries).toHaveLength(2);
    expect(payer.timeline(defaultModes()).modeAt(paris("2026-12-10")).mode).toBe("weekly");
  });

  it("refuse d'annuler quand rien n'est programmé", () => {
    expect(() => history().cancelScheduled({ at: paris("2026-10-08"), staffId: "s" })).toThrow(
      NoScheduledPayerBillingModeError,
    );
  });
});
