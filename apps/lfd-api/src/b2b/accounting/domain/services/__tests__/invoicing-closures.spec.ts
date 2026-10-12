import {
  InvalidPeriodClosureError,
  NotABillingClosureError,
} from "../../errors/monthly-invoice-errors.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { BillingRhythmSetting } from "../../value-objects/billing-rhythm-setting.js";
import { StatementMonth } from "../../value-objects/statement-month.js";
import {
  closureToInvoice,
  closuresToAttempt,
  invoicedPeriodOf,
  invoicingMomentOf,
  lastDayOf,
  MAX_CLOSURES_PER_PASS,
  parsePeriodClosure,
  periodLabelOf,
  periodMonthOf,
  previousClosureOf,
} from "../invoicing-closures.js";

/**
 * La facture par clôture, sa partie pure (R3). Les dates sont le SUJET des
 * tests et ne sont comparées qu'entre elles : aucune horloge n'est lue.
 */

const MONTHLY = BillingRhythmSetting.initial();
const WEEKLY_MONDAY = BillingRhythmSetting.of(BillingRhythm.weekly(1), null);
const SEMIMONTHLY = BillingRhythmSetting.of(BillingRhythm.semimonthly(1, 16), null);

/** 30 septembre 2026, 23h55 à Paris (heure d'été, UTC+2) — E4b. */
const SEPTEMBER_MOMENT = new Date("2026-09-30T21:55:00.000Z");
/** 1er octobre 2026 à 00h00 à Paris : la clôture de septembre. */
const OCT_1 = new Date("2026-09-30T22:00:00.000Z");

/** Le 1er de chaque mois de deux années, en clôture, et son mois. */
const MONTHS = Array.from({ length: 24 }, (_, index) =>
  StatementMonth.parse(
    `${String(2026 + Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`,
  ),
);

describe("mensuel au 1er — exactement la facture du mois d'avant le rythme", () => {
  it("le moment d'émission est le dernier jour du mois à 23h55, heure de Paris", () => {
    expect(lastDayOf(OCT_1)).toBe("2026-09-30");
    expect(invoicingMomentOf(OCT_1)).toEqual(SEPTEMBER_MOMENT);
    // Février d'une année non bissextile, à l'heure d'hiver (UTC+1).
    const march = new Date("2027-02-28T23:00:00.000Z");
    expect(lastDayOf(march)).toBe("2027-02-28");
    expect(invoicingMomentOf(march)).toEqual(new Date("2027-02-28T22:55:00.000Z"));
  });

  it("chaque mois de deux années : même clôture, mêmes bornes, même moment que le mois civil", () => {
    for (const month of MONTHS) {
      const cycle = month.cycle();
      const moment = invoicingMomentOf(cycle.closesAt);

      expect(closureToInvoice(moment, MONTHLY)).toEqual(cycle.closesAt);
      expect(closureToInvoice(new Date(moment.getTime() - 1), MONTHLY)).toEqual(cycle.startsAt);
      expect(invoicedPeriodOf(cycle.closesAt, MONTHLY)).toEqual(cycle);
      expect(periodMonthOf(cycle.closesAt)).toBe(month.toString());
    }
  });

  it("le 8 octobre, c'est encore septembre ; à 22h le dernier jour, encore août (régression E4b)", () => {
    expect(closureToInvoice(new Date("2026-10-08T09:00:00.000Z"), MONTHLY)).toEqual(OCT_1);
    expect(closureToInvoice(new Date("2026-09-30T20:00:00.000Z"), MONTHLY)).toEqual(
      new Date("2026-08-31T22:00:00.000Z"),
    );
  });
});

describe("bimensuel le 1er et le 16", () => {
  it("la clôture du 16 ferme la quinzaine du 1er au 15, émise le 15 à 23h55", () => {
    const sep16 = new Date("2026-09-15T22:00:00.000Z");
    expect(closureToInvoice(new Date("2026-09-15T21:55:00.000Z"), SEMIMONTHLY)).toEqual(sep16);
    expect(invoicedPeriodOf(sep16, SEMIMONTHLY)).toEqual({
      startsAt: new Date("2026-08-31T22:00:00.000Z"),
      closesAt: sep16,
    });
  });

  it("la clôture du 1er ferme la seconde quinzaine", () => {
    expect(invoicedPeriodOf(OCT_1, SEMIMONTHLY).startsAt).toEqual(
      new Date("2026-09-15T22:00:00.000Z"),
    );
    expect(periodLabelOf(invoicedPeriodOf(OCT_1, SEMIMONTHLY))).toBe("du 16 au 30 septembre 2026");
  });
});

describe("hebdomadaire au lundi", () => {
  const MON_28_SEP = new Date("2026-09-27T22:00:00.000Z");

  it("la semaine du lundi au dimanche, émise le dimanche à 23h55", () => {
    expect(closureToInvoice(new Date("2026-09-27T21:55:00.000Z"), WEEKLY_MONDAY)).toEqual(
      MON_28_SEP,
    );
    expect(closureToInvoice(new Date("2026-09-27T21:54:59.999Z"), WEEKLY_MONDAY)).toEqual(
      new Date("2026-09-20T22:00:00.000Z"),
    );
    expect(periodLabelOf(invoicedPeriodOf(MON_28_SEP, WEEKLY_MONDAY))).toBe(
      "du 21 au 27 septembre 2026",
    );
  });

  it("une semaine à cheval sur deux mois, puis sur deux années", () => {
    const mon5Oct = new Date("2026-10-04T22:00:00.000Z");
    expect(periodLabelOf(invoicedPeriodOf(mon5Oct, WEEKLY_MONDAY))).toBe(
      "du 28 septembre au 4 octobre 2026",
    );
    expect(periodMonthOf(mon5Oct)).toBe("2026-10");
    const mon4Jan = new Date("2027-01-03T23:00:00.000Z");
    expect(periodLabelOf(invoicedPeriodOf(mon4Jan, WEEKLY_MONDAY))).toBe(
      "du 28 décembre 2026 au 3 janvier 2027",
    );
  });

  it("passage à l'heure d'hiver (25 octobre 2026) : la semaine dure 169 heures, l'émission reste à 23h55", () => {
    const mon26Oct = new Date("2026-10-25T23:00:00.000Z");
    const period = invoicedPeriodOf(mon26Oct, WEEKLY_MONDAY);
    expect(period.startsAt).toEqual(new Date("2026-10-18T22:00:00.000Z"));
    expect(invoicingMomentOf(mon26Oct)).toEqual(new Date("2026-10-25T22:55:00.000Z"));
  });

  it("passage à l'heure d'été (29 mars 2026) : la semaine dure 167 heures", () => {
    const mon30Mar = new Date("2026-03-29T22:00:00.000Z");
    expect(invoicedPeriodOf(mon30Mar, WEEKLY_MONDAY).startsAt).toEqual(
      new Date("2026-03-22T23:00:00.000Z"),
    );
    expect(invoicingMomentOf(mon30Mar)).toEqual(new Date("2026-03-29T21:55:00.000Z"));
  });
});

describe("changement de rythme programmé", () => {
  /** Mensuel au 1er, puis hebdomadaire au lundi à partir du 1er octobre. */
  const SWITCHING = BillingRhythmSetting.of(BillingRhythm.default(), {
    rhythm: BillingRhythm.weekly(1),
    effectiveAt: OCT_1,
  });

  it("la clôture de l'ancien rythme est facturée sur l'ancien : tout septembre", () => {
    expect(invoicedPeriodOf(OCT_1, SWITCHING)).toEqual({
      startsAt: new Date("2026-08-31T22:00:00.000Z"),
      closesAt: OCT_1,
    });
  });

  it("la suivante, sur le nouveau, part de la clôture de l'ancien — ni trou, ni chevauchement", () => {
    const mon5Oct = new Date("2026-10-04T22:00:00.000Z");
    expect(previousClosureOf(mon5Oct, SWITCHING)).toEqual(OCT_1);
    expect(invoicedPeriodOf(mon5Oct, SWITCHING)).toEqual({ startsAt: OCT_1, closesAt: mon5Oct });
    // Le lundi 28 septembre n'est PAS une clôture : septembre était encore mensuel.
    expect(() => invoicedPeriodOf(new Date("2026-09-27T22:00:00.000Z"), SWITCHING)).toThrow(
      NotABillingClosureError,
    );
  });

  it("la clôture à facturer suit la bascule", () => {
    expect(closureToInvoice(SEPTEMBER_MOMENT, SWITCHING)).toEqual(OCT_1);
    expect(closureToInvoice(new Date("2026-10-04T21:55:00.000Z"), SWITCHING)).toEqual(
      new Date("2026-10-04T22:00:00.000Z"),
    );
  });
});

describe("closuresToAttempt — le rattrapage", () => {
  it("sans point de départ, la seule clôture à facturer", () => {
    expect(closuresToAttempt(new Date("2026-12-01T08:00:00.000Z"), MONTHLY, null)).toEqual([
      new Date("2026-11-30T23:00:00.000Z"),
    ]);
  });

  it("toutes celles qui suivent le point de départ, dans l'ordre", () => {
    expect(
      closuresToAttempt(
        new Date("2026-12-01T08:00:00.000Z"),
        MONTHLY,
        new Date("2026-08-31T22:00:00.000Z"),
      ),
    ).toEqual([OCT_1, new Date("2026-10-31T23:00:00.000Z"), new Date("2026-11-30T23:00:00.000Z")]);
  });

  it("un point de départ qui est la clôture à facturer : elle seule (la tentative la tait)", () => {
    expect(closuresToAttempt(SEPTEMBER_MOMENT, MONTHLY, OCT_1)).toEqual([OCT_1]);
  });

  it("au plus MAX_CLOSURES_PER_PASS, les plus anciennes d'abord", () => {
    const closures = closuresToAttempt(
      new Date("2026-09-28T08:00:00.000Z"),
      WEEKLY_MONDAY,
      new Date("2026-01-04T23:00:00.000Z"),
    );
    expect(closures).toHaveLength(MAX_CLOSURES_PER_PASS);
    expect(closures[0]).toEqual(new Date("2026-01-11T23:00:00.000Z"));
  });
});

describe("parsePeriodClosure", () => {
  it("lit un instant ISO, refuse le reste", () => {
    expect(parsePeriodClosure(OCT_1.toISOString())).toEqual(OCT_1);
    expect(() => parsePeriodClosure("pas une date")).toThrow(InvalidPeriodClosureError);
  });
});
