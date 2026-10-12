import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { BillingRhythmSetting } from "../../value-objects/billing-rhythm-setting.js";
import { StatementMonth } from "../../value-objects/statement-month.js";
import {
  cycleAt,
  cycleToConstitute,
  isCalendarClosure,
  type BillingCycle,
} from "../billing-cycle.js";
import { autopilotTurn } from "../collection-autopilot.js";
import {
  entityCycleAt,
  entityCycleToConstitute,
  isEntityClosure,
  lastClosureAtOrBefore,
  upcomingClosures,
} from "../entity-closures.js";

/**
 * Le cycle de prélèvement au rythme de l'entité (R4). Les dates sont le SUJET
 * des tests et ne sont comparées qu'entre elles : aucune horloge n'est lue.
 */

const MONTHLY = BillingRhythmSetting.initial();
const WEEKLY_MONDAY = BillingRhythmSetting.of(BillingRhythm.weekly(1), null);
const SEMIMONTHLY = BillingRhythmSetting.of(BillingRhythm.semimonthly(1, 16), null);

const HOUR_MS = 3_600_000;

/** Le 1er de chaque mois de deux années, en cycle civil. */
const CYCLES: readonly BillingCycle[] = Array.from({ length: 24 }, (_, index) =>
  StatementMonth.parse(
    `${String(2026 + Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`,
  ).cycle(),
);

/** Des instants qui éprouvent les bords : la clôture, juste avant, juste après, le milieu. */
function probesOf(cycle: BillingCycle): readonly Date[] {
  const start = cycle.startsAt.getTime();
  return [
    cycle.startsAt,
    new Date(start - 1),
    new Date(start + 1),
    new Date(start + 14 * 24 * HOUR_MS + 5 * HOUR_MS),
    new Date(cycle.closesAt.getTime() - 1),
  ];
}

describe("mensuel au 1er — EXACTEMENT le cycle calendaire d'avant le rythme", () => {
  it("deux années d'instants : mêmes cycles en cours et à constituer, sans clôture enregistrée", () => {
    for (const cycle of CYCLES) {
      for (const now of probesOf(cycle)) {
        expect(entityCycleAt(now, MONTHLY, null)).toEqual(cycleAt(now, null));
        expect(entityCycleToConstitute(now, MONTHLY, null)).toEqual(cycleToConstitute(now, null));
      }
    }
  });

  it("avec une clôture enregistrée (anticipée ou non), mêmes bornes basses", () => {
    for (const cycle of CYCLES) {
      const anticipated = new Date(cycle.startsAt.getTime() + 19 * 24 * HOUR_MS);
      for (const recorded of [cycle.startsAt, anticipated, cycle.closesAt]) {
        for (const now of probesOf(cycle)) {
          expect(entityCycleAt(now, MONTHLY, recorded)).toEqual(cycleAt(now, recorded));
          expect(entityCycleToConstitute(now, MONTHLY, recorded)).toEqual(
            cycleToConstitute(now, recorded),
          );
        }
      }
    }
  });

  it("une clôture de l'entité est exactement un 1er du mois à 00h00 de Paris", () => {
    for (const cycle of CYCLES) {
      // À la minute près : `isCalendarClosure` lit l'heure locale en hh:mm.
      const wholeMinutes = probesOf(cycle).filter((instant) => instant.getTime() % 60_000 === 0);
      for (const instant of [...wholeMinutes, cycle.closesAt]) {
        expect(isEntityClosure(instant, MONTHLY)).toBe(isCalendarClosure(instant));
      }
    }
  });

  it("plus stricte que le calendrier sous la minute : 00h00 et une milliseconde n'est pas une clôture", () => {
    const [first] = CYCLES;
    const justAfter = new Date((first?.startsAt.getTime() ?? 0) + 1);
    expect(isCalendarClosure(justAfter)).toBe(true);
    expect(isEntityClosure(justAfter, MONTHLY)).toBe(false);
  });

  it("le tour de l'automatisme vise la même clôture qu'avant le rythme", () => {
    for (const cycle of CYCLES) {
      for (const now of probesOf(cycle)) {
        expect(autopilotTurn(now, 1, MONTHLY).cycleClosesAt).toEqual(
          cycleToConstitute(now, null).closesAt,
        );
      }
    }
  });
});

describe("hebdomadaire du lundi", () => {
  /** Mercredi 14 octobre 2026, midi à Paris. */
  const WEDNESDAY = new Date("2026-10-14T10:00:00.000Z");
  /** Lundi 12 octobre 2026, 00h00 Paris (heure d'été). */
  const MONDAY_12 = new Date("2026-10-11T22:00:00.000Z");
  const MONDAY_5 = new Date("2026-10-04T22:00:00.000Z");
  const MONDAY_19 = new Date("2026-10-18T22:00:00.000Z");

  it("le cycle en cours va du lundi passé au lundi suivant", () => {
    expect(entityCycleAt(WEDNESDAY, WEEKLY_MONDAY, null)).toEqual({
      startsAt: MONDAY_12,
      closesAt: MONDAY_19,
    });
  });

  it("le cycle à constituer est la semaine close au dernier lundi", () => {
    expect(entityCycleToConstitute(WEDNESDAY, WEEKLY_MONDAY, null)).toEqual({
      startsAt: MONDAY_5,
      closesAt: MONDAY_12,
    });
    // À l'instant exact de la clôture, la semaine qu'elle ferme est à constituer.
    expect(lastClosureAtOrBefore(MONDAY_12, WEEKLY_MONDAY)).toEqual(MONDAY_12);
  });

  it("la clôture enregistrée borne la semaine quand elle la précède", () => {
    const recorded = new Date("2026-10-07T22:00:00.000Z");
    expect(entityCycleToConstitute(WEDNESDAY, WEEKLY_MONDAY, recorded).startsAt).toEqual(recorded);
  });

  it("une clôture est un lundi à 00h00, rien d'autre", () => {
    expect(isEntityClosure(MONDAY_12, WEEKLY_MONDAY)).toBe(true);
    expect(isEntityClosure(WEDNESDAY, WEEKLY_MONDAY)).toBe(false);
    expect(isEntityClosure(new Date("2026-09-30T22:00:00.000Z"), WEEKLY_MONDAY)).toBe(false);
  });

  it("passe l'heure d'hiver sans décaler minuit", () => {
    // Le 25 octobre 2026, Paris repasse à UTC+1 : le lundi 26 clôt à 23h00 UTC.
    expect(upcomingClosures(MONDAY_12, WEEKLY_MONDAY, 3)).toEqual([
      MONDAY_19,
      new Date("2026-10-25T23:00:00.000Z"),
      new Date("2026-11-01T23:00:00.000Z"),
    ]);
  });

  it("l'automatisme tente chaque lundi, une fois l'heure prévue passée", () => {
    const turn = autopilotTurn(new Date(MONDAY_12.getTime() + 30 * 60_000), 1, WEEKLY_MONDAY);
    expect(turn).toMatchObject({ cycleClosesAt: MONDAY_12, due: false });
    expect(autopilotTurn(WEDNESDAY, 1, WEEKLY_MONDAY)).toMatchObject({
      cycleClosesAt: MONDAY_12,
      due: true,
    });
  });
});

describe("au passage d'un rythme à l'autre", () => {
  /** Mensuel jusqu'au 1er novembre 2026, puis hebdomadaire du lundi. */
  const NOV_1 = new Date("2026-10-31T23:00:00.000Z");
  const SWITCHING = BillingRhythmSetting.of(BillingRhythm.monthly(1), {
    rhythm: BillingRhythm.weekly(1),
    effectiveAt: NOV_1,
  });

  it("la première semaine part de la clôture mensuelle, sans trou", () => {
    // Le 1er novembre 2026 est un dimanche : la première période hebdomadaire
    // ne dure qu'un jour, du 1er au lundi 2.
    const monday2 = new Date("2026-11-01T23:00:00.000Z");
    expect(entityCycleAt(new Date("2026-11-01T10:00:00.000Z"), SWITCHING, null)).toEqual({
      startsAt: NOV_1,
      closesAt: monday2,
    });
    expect(entityCycleAt(new Date("2026-11-04T10:00:00.000Z"), SWITCHING, null)).toEqual({
      startsAt: monday2,
      closesAt: new Date("2026-11-08T23:00:00.000Z"),
    });
    // Le 1er novembre à midi : la période à constituer est octobre, close le 1er ;
    // le jeudi 5, c'est le jour du 1er au lundi 2.
    expect(entityCycleToConstitute(new Date("2026-11-01T11:00:00.000Z"), SWITCHING, null)).toEqual({
      startsAt: new Date("2026-09-30T22:00:00.000Z"),
      closesAt: NOV_1,
    });
    expect(entityCycleToConstitute(new Date("2026-11-05T10:00:00.000Z"), SWITCHING, null)).toEqual({
      startsAt: NOV_1,
      closesAt: monday2,
    });
    expect(isEntityClosure(NOV_1, SWITCHING)).toBe(true);
  });
});

describe("bimensuel, le 1er et le 16", () => {
  it("annonce les trois prochaines clôtures", () => {
    // 10 octobre 2026, midi à Paris.
    expect(upcomingClosures(new Date("2026-10-10T10:00:00.000Z"), SEMIMONTHLY, 3)).toEqual([
      new Date("2026-10-15T22:00:00.000Z"),
      new Date("2026-10-31T23:00:00.000Z"),
      new Date("2026-11-15T23:00:00.000Z"),
    ]);
  });
});
