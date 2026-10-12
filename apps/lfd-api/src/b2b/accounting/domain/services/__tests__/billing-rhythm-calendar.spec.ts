import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { cycleAt, nextClosureAfter, periodAt } from "../billing-cycle.js";

/**
 * ⚠️ Dates absolues, exception prévue par le §5 du CLAUDE.md : ce module ne lit
 * aucune horloge, l'instant lui est donné ; les dates sont le sujet du test et
 * ne sont comparées qu'entre elles.
 */

const next = (instant: string, rhythm: BillingRhythm): string =>
  nextClosureAfter(new Date(instant), rhythm).toISOString();

describe("nextClosureAfter — mensuel", () => {
  it("le 1er : minuit de Paris du mois suivant, pas minuit UTC", () => {
    expect(next("2026-09-10T12:00:00.000Z", BillingRhythm.monthly(1))).toBe(
      "2026-09-30T22:00:00.000Z",
    );
  });

  it("le 28 : la clôture de février tombe le 28", () => {
    expect(next("2027-02-10T12:00:00.000Z", BillingRhythm.monthly(28))).toBe(
      "2027-02-27T23:00:00.000Z",
    );
  });

  it("le 28 : passé le 28 février, la suivante est le 28 mars, à l'heure d'hiver", () => {
    expect(next("2027-02-28T12:00:00.000Z", BillingRhythm.monthly(28))).toBe(
      "2027-03-27T23:00:00.000Z",
    );
  });

  it("le 31 décembre mène au 1er janvier de l'année suivante", () => {
    expect(next("2026-12-31T20:00:00.000Z", BillingRhythm.monthly(1))).toBe(
      "2026-12-31T23:00:00.000Z",
    );
  });

  it("à l'instant exact d'une clôture, rend la suivante", () => {
    expect(next("2026-09-30T22:00:00.000Z", BillingRhythm.monthly(1))).toBe(
      "2026-10-31T23:00:00.000Z",
    );
  });
});

describe("nextClosureAfter — bimensuel", () => {
  const firstAndSixteenth = BillingRhythm.semimonthly(1, 16);
  const fifthAndTwentieth = BillingRhythm.semimonthly(5, 20);

  it("1/16 : du 3 au 16", () => {
    expect(next("2026-09-03T10:00:00.000Z", firstAndSixteenth)).toBe("2026-09-15T22:00:00.000Z");
  });

  it("1/16 : à l'instant exact du 16, rend le 1er suivant", () => {
    expect(next("2026-09-15T22:00:00.000Z", firstAndSixteenth)).toBe("2026-09-30T22:00:00.000Z");
  });

  it("5/20 : après le 20 décembre, le 5 janvier", () => {
    expect(next("2026-12-25T10:00:00.000Z", fifthAndTwentieth)).toBe("2027-01-04T23:00:00.000Z");
  });

  it("5/20 : à l'instant exact du 5, rend le 20", () => {
    expect(next("2026-10-04T22:00:00.000Z", fifthAndTwentieth)).toBe("2026-10-19T22:00:00.000Z");
  });
});

describe("nextClosureAfter — hebdomadaire", () => {
  it("le lundi : d'un jeudi au lundi suivant", () => {
    // jeudi 2026-09-10 → lundi 2026-09-14
    expect(next("2026-09-10T12:00:00.000Z", BillingRhythm.weekly(1))).toBe(
      "2026-09-13T22:00:00.000Z",
    );
  });

  it("le lundi : à l'instant exact d'un lundi, rend celui d'après", () => {
    expect(next("2026-09-13T22:00:00.000Z", BillingRhythm.weekly(1))).toBe(
      "2026-09-20T22:00:00.000Z",
    );
  });

  it("le dimanche (7) : d'un jeudi au dimanche suivant", () => {
    expect(next("2026-09-10T12:00:00.000Z", BillingRhythm.weekly(7))).toBe(
      "2026-09-12T22:00:00.000Z",
    );
  });
});

describe("passages d'heure", () => {
  it("heure d'été (29 mars 2026) : la clôture du lundi 30 est à 22h UTC", () => {
    expect(next("2026-03-27T12:00:00.000Z", BillingRhythm.weekly(1))).toBe(
      "2026-03-29T22:00:00.000Z",
    );
  });

  it("heure d'hiver (25 octobre 2026) : la clôture du lundi 26 est à 23h UTC", () => {
    expect(next("2026-10-23T12:00:00.000Z", BillingRhythm.weekly(1))).toBe(
      "2026-10-25T23:00:00.000Z",
    );
  });

  it("une période qui enjambe l'heure d'été n'est pas bornée à minuit UTC", () => {
    const period = periodAt(new Date("2026-03-25T12:00:00.000Z"), BillingRhythm.monthly(16), null);
    expect(period.startsAt.toISOString()).toBe("2026-03-15T23:00:00.000Z");
    expect(period.closesAt.toISOString()).toBe("2026-04-15T22:00:00.000Z");
  });
});

describe("periodAt", () => {
  const rhythm = BillingRhythm.semimonthly(1, 16);

  it("sans clôture enregistrée, part de la clôture du rythme qui précède", () => {
    const period = periodAt(new Date("2026-09-20T10:00:00.000Z"), rhythm, null);
    expect(period.startsAt.toISOString()).toBe("2026-09-15T22:00:00.000Z");
    expect(period.closesAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("à l'instant exact d'une clôture, la période s'ouvre sur elle", () => {
    const period = periodAt(new Date("2026-09-15T22:00:00.000Z"), rhythm, null);
    expect(period.startsAt.toISOString()).toBe("2026-09-15T22:00:00.000Z");
  });

  it("part de la clôture enregistrée quand elle précède la clôture à venir", () => {
    const recorded = new Date("2026-09-12T08:00:00.000Z");
    const period = periodAt(new Date("2026-09-14T10:00:00.000Z"), rhythm, recorded);
    expect(period.startsAt).toEqual(recorded);
    expect(period.closesAt.toISOString()).toBe("2026-09-15T22:00:00.000Z");
  });

  it("ignore une clôture enregistrée qui ne précède pas la clôture à venir", () => {
    const period = periodAt(
      new Date("2026-09-14T10:00:00.000Z"),
      rhythm,
      new Date("2026-09-15T22:00:00.000Z"),
    );
    expect(period.startsAt.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });
});

describe("periodAt au rythme par défaut = cycleAt", () => {
  const cases: readonly (readonly [string, string | null])[] = [
    ["2026-09-10T12:00:00.000Z", null],
    ["2026-09-30T22:00:00.000Z", null],
    ["2026-12-31T23:30:00.000Z", null],
    ["2026-03-29T01:30:00.000Z", null],
    ["2026-10-25T01:30:00.000Z", null],
    ["2026-09-10T12:00:00.000Z", "2026-09-05T10:00:00.000Z"],
    ["2026-09-10T12:00:00.000Z", "2026-09-30T22:00:00.000Z"],
    ["2026-09-10T12:00:00.000Z", "2026-08-20T10:00:00.000Z"],
  ];

  it.each(cases)("à %s, clôture enregistrée %s", (now, recorded) => {
    const previous = recorded === null ? null : new Date(recorded);
    expect(periodAt(new Date(now), BillingRhythm.default(), previous)).toEqual(
      cycleAt(new Date(now), previous),
    );
  });
});
