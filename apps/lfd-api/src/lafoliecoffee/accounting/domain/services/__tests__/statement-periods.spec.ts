import {
  FutureStatementPeriodError,
  NotAStatementPeriodError,
} from "../../errors/statement-errors.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { BillingRhythmSetting } from "../../value-objects/billing-rhythm-setting.js";
import {
  currentStatementPeriod,
  listedStatementPeriods,
  requestedStatementPeriod,
  STATEMENT_PERIODS_LISTED,
  timelinePeriods,
} from "../statement-periods.js";

/** Lundi 12 octobre 2026, 11h à Paris. Comparé aux seules clôtures calculées. */
const NOW = new Date("2026-10-12T09:00:00.000Z");
const MONTHLY = timelinePeriods(BillingRhythmSetting.initial());
const WEEKLY = timelinePeriods(BillingRhythmSetting.of(BillingRhythm.weekly(1), null));
const SEMIMONTHLY = timelinePeriods(
  BillingRhythmSetting.of(BillingRhythm.semimonthly(1, 16), null),
);

describe("currentStatementPeriod", () => {
  it("rend la période qui contient l'instant, en cours, avec son libellé", () => {
    expect(currentStatementPeriod(NOW, SEMIMONTHLY)).toEqual({
      cycle: {
        startsAt: new Date("2026-09-30T22:00:00.000Z"),
        closesAt: new Date("2026-10-15T22:00:00.000Z"),
      },
      label: "du 1er au 15 octobre 2026",
      inProgress: true,
    });
  });

  it("à l'instant exact d'une clôture, la période qui s'ouvre", () => {
    const monday = new Date("2026-10-11T22:00:00.000Z");
    expect(currentStatementPeriod(monday, WEEKLY).cycle.startsAt).toEqual(monday);
  });
});

describe("requestedStatementPeriod", () => {
  it("rend une période passée, close", () => {
    // La semaine du 28 septembre est coupée au 1er octobre (Q-L1, lot ZL).
    const period = requestedStatementPeriod(new Date("2026-10-04T22:00:00.000Z"), NOW, WEEKLY);
    expect(period.label).toBe("du 1er au 4 octobre 2026");
    expect(period.inProgress).toBe(false);
  });

  it("rend la période en cours quand on demande sa clôture", () => {
    const period = requestedStatementPeriod(new Date("2026-10-18T22:00:00.000Z"), NOW, WEEKLY);
    expect(period.inProgress).toBe(true);
  });

  it("refuse un instant qui ne clôt aucune période", () => {
    expect(() =>
      requestedStatementPeriod(new Date("2026-10-07T22:00:00.000Z"), NOW, WEEKLY),
    ).toThrow(NotAStatementPeriodError);
  });

  it("refuse une période qui n'a pas commencé", () => {
    expect(() =>
      requestedStatementPeriod(new Date("2026-10-25T23:00:00.000Z"), NOW, WEEKLY),
    ).toThrow(FutureStatementPeriodError);
  });
});

describe("listedStatementPeriods", () => {
  it("sans mise en service : les douze dernières, la plus récente d'abord, sans trou", () => {
    const periods = listedStatementPeriods(NOW, MONTHLY, null);
    expect(periods).toHaveLength(STATEMENT_PERIODS_LISTED);
    for (let rank = 1; rank < periods.length; rank += 1) {
      expect(periods[rank]?.cycle.closesAt).toEqual(periods[rank - 1]?.cycle.startsAt);
    }
  });

  it("s'arrête à la mise en service : aucune période close à cet instant ou avant", () => {
    const floor = new Date("2026-09-30T22:00:00.000Z");
    const labels = listedStatementPeriods(NOW, SEMIMONTHLY, floor).map((period) => period.label);
    expect(labels).toEqual(["du 1er au 15 octobre 2026"]);

    const earlier = listedStatementPeriods(NOW, SEMIMONTHLY, new Date("2026-09-15T22:00:00Z"));
    expect(earlier.map((period) => period.label)).toEqual([
      "du 1er au 15 octobre 2026",
      "du 16 au 30 septembre 2026",
    ]);
  });
});
