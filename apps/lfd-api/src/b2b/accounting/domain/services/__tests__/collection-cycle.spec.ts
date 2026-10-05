import { cycleToConstitute, isCalendarClosure } from "../billing-cycle.js";

describe("le cycle qu'on constitue, et la première clôture au 1er (§6 bis)", () => {
  const OCT_2 = new Date("2026-10-02T09:00:00.000Z");

  it("sans clôture enregistrée : le mois civil précédent, clos au 1er à 00h00 de Paris", () => {
    expect(cycleToConstitute(OCT_2, null)).toEqual({
      startsAt: new Date("2026-08-31T22:00:00.000Z"),
      closesAt: new Date("2026-09-30T22:00:00.000Z"),
    });
  });

  it("part de la dernière clôture enregistrée quand elle précède", () => {
    const previous = new Date("2026-08-31T22:00:00.000Z");

    expect(cycleToConstitute(OCT_2, previous).startsAt).toEqual(previous);
  });

  it("reconnaît une clôture calendaire, été comme hiver, et rien d'autre", () => {
    expect(isCalendarClosure(new Date("2026-09-30T22:00:00.000Z"))).toBe(true);
    expect(isCalendarClosure(new Date("2026-11-30T23:00:00.000Z"))).toBe(true);
    expect(isCalendarClosure(new Date("2026-09-30T00:00:00.000Z"))).toBe(false);
    expect(isCalendarClosure(new Date("2026-09-19T22:00:00.000Z"))).toBe(false);
  });
});
