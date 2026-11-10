import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { sameBillingDates, type EntityBillingDates } from "../entity-billing-dates.js";
import { ModeDatesTimeline } from "../mode-dates-timeline.js";
import { defaultModes, paris } from "./billing-mode-fixtures.js";

/** Des dates comparées entre elles seulement — aucune horloge. */
const WEEKLY_PORT = {
  payerCompanyId: "c_port",
  segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" as const }],
};

const dates = (overrides: Partial<EntityBillingDates> = {}): EntityBillingDates => ({
  modes: defaultModes(),
  payers: [WEEKLY_PORT],
  ...overrides,
});

describe("sameBillingDates — deux entités suivent-elles les mêmes suites ? (M4a)", () => {
  it("mêmes dates de modes, mêmes payeurs aux mêmes segments : oui, quel que soit l'ordre", () => {
    const other = { payerCompanyId: "c_quai", segments: [] };
    expect(
      sameBillingDates(
        dates({ payers: [WEEKLY_PORT, other] }),
        dates({ payers: [other, WEEKLY_PORT] }),
      ),
    ).toBe(true);
  });

  it("un payeur de plus d'un côté : non", () => {
    expect(sameBillingDates(dates(), dates({ payers: [] }))).toBe(false);
  });

  it("le même payeur à un autre mode : non", () => {
    const semimonthly = {
      payerCompanyId: "c_port",
      segments: [{ effectiveFrom: paris("2026-08-01"), mode: "semimonthly" as const }],
    };
    expect(sameBillingDates(dates(), dates({ payers: [semimonthly] }))).toBe(false);
  });

  it("le même payeur depuis une autre clôture : non", () => {
    const later = {
      payerCompanyId: "c_port",
      segments: [{ effectiveFrom: paris("2026-09-01"), mode: "weekly" as const }],
    };
    expect(sameBillingDates(dates(), dates({ payers: [later] }))).toBe(false);
  });

  it("les dates d'un mode qui diffèrent : non", () => {
    const tuesday = ModeDatesTimeline.of("weekly", [
      { effectiveFrom: paris("2026-08-03"), rhythm: BillingRhythm.weekly(2) },
    ]);
    expect(sameBillingDates(dates(), dates({ modes: defaultModes({ weekly: tuesday }) }))).toBe(
      false,
    );
  });
});
