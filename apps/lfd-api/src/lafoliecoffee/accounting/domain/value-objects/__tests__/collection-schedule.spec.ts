import {
  CollectionBeforeNoticeError,
  InvalidCollectionScheduleError,
} from "../../errors/collection-schedule-errors.js";
import { assertCollectionAfterNotice, CollectionSchedule } from "../collection-schedule.js";

const VALID = { delayHours: 1, daysAfterClosure: null, depositCutoff: null };

describe("CollectionSchedule", () => {
  it("part d'un état qui ne change rien : 1 h, N = délai, cut-off à renseigner", () => {
    const initial = CollectionSchedule.initial();

    expect(initial).toMatchObject({ delayHours: 1, daysAfterClosure: null, depositCutoff: null });
    expect(initial.collectionDays(14)).toBe(14);
  });

  /** Au-delà de 23 h, la constitution passerait au lendemain et rognerait le préavis. */
  it.each([0, 24, 1.5])("refuse un délai de constitution de %s h", (delayHours) => {
    expect(() => CollectionSchedule.create({ ...VALID, delayHours })).toThrow(
      InvalidCollectionScheduleError,
    );
  });

  it.each([0, 61])("refuse une échéance à %i jours", (daysAfterClosure) => {
    expect(() => CollectionSchedule.create({ ...VALID, daysAfterClosure })).toThrow(
      InvalidCollectionScheduleError,
    );
  });

  it("refuse un cut-off sans heure lisible, ou hors bornes", () => {
    expect(() =>
      CollectionSchedule.create({
        ...VALID,
        depositCutoff: { businessDaysBefore: 2, time: "25:00" },
      }),
    ).toThrow(InvalidCollectionScheduleError);
    expect(() =>
      CollectionSchedule.create({
        ...VALID,
        depositCutoff: { businessDaysBefore: 0, time: "16:00" },
      }),
    ).toThrow(InvalidCollectionScheduleError);
  });

  it("deux calendriers aux mêmes valeurs sont égaux", () => {
    const cutoff = { businessDaysBefore: 2, time: "16:00" };
    const left = CollectionSchedule.create({ ...VALID, depositCutoff: cutoff });

    expect(left.equals(CollectionSchedule.create({ ...VALID, depositCutoff: { ...cutoff } }))).toBe(
      true,
    );
    expect(left.equals(CollectionSchedule.initial())).toBe(false);
  });
});

describe("assertCollectionAfterNotice", () => {
  it("accepte N égal au délai, et un N non réglé quel que soit le délai", () => {
    expect(() => assertCollectionAfterNotice(14, 14)).not.toThrow();
    expect(() => assertCollectionAfterNotice(null, 60)).not.toThrow();
  });

  it("refuse N plus court que le délai, en nommant les deux valeurs et la clause", () => {
    expect(() => assertCollectionAfterNotice(4, 14)).toThrow(CollectionBeforeNoticeError);
    expect(() => assertCollectionAfterNotice(4, 14)).toThrow(/clôture \+ 4 jours.*14 jours.*CGV/su);
  });
});
