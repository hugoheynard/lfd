import { FollowPeriodWindowError } from "../../errors/hierarchy-errors.js";
import { FollowPeriod } from "../follow-period.js";

/**
 * Les dates sont le SUJET : elles ne se comparent qu'entre elles, jamais à
 * l'horloge (CLAUDE.md §5, l'exception étroite).
 */
const FROM = new Date("2030-03-01T08:00:00.000Z");
const BEFORE = new Date("2030-02-28T08:00:00.000Z");
const LATER = new Date("2030-03-12T08:00:00.000Z");
const END = new Date("2030-04-01T08:00:00.000Z");

describe("FollowPeriod", () => {
  it("une période ouverte couvre son début et tout ce qui suit", () => {
    const period = FollowPeriod.open("pricing", "groupe", FROM);

    expect(period.isOpen).toBe(true);
    expect(period.covers(BEFORE)).toBe(false);
    expect(period.covers(FROM)).toBe(true);
    expect(period.covers(LATER)).toBe(true);
  });

  it("une période close exclut sa fin", () => {
    const period = FollowPeriod.open("pricing", "groupe", FROM).closeAt(END);

    expect(period.isOpen).toBe(false);
    expect(period.covers(LATER)).toBe(true);
    expect(period.covers(END)).toBe(false);
  });

  it("refuse une fin qui n'est pas après le début", () => {
    const period = FollowPeriod.open("billing", "groupe", FROM);

    expect(() => period.closeAt(FROM)).toThrow(FollowPeriodWindowError);
    expect(() => period.closeAt(BEFORE)).toThrow(FollowPeriodWindowError);
  });
});
