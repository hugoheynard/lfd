import { sameDayDoorOf, sameDayOpenTo, type SameDayDoorSettings } from "../same-day-doors.js";

/**
 * Le jour même par clientèle (plan `plan-jour-meme-sur-stock.md`, §3, lot
 * L4) : trois portes, trois réglages — l'ancien interrupteur unique n'est
 * plus lu.
 */

const CLOSED: SameDayDoorSettings = {
  sameDayPublicAllowed: false,
  sameDayProAllowed: false,
  sameDayProOnline: false,
};

describe("sameDayDoorOf", () => {
  it("l'équipe passe par le comptoir, même pour une société", () => {
    expect(sameDayDoorOf("c1", true)).toBe("counter");
  });

  it("sans société, un particulier en ligne ; avec, un pro en ligne", () => {
    expect(sameDayDoorOf(null, false)).toBe("public_online");
    expect(sameDayDoorOf("c1", false)).toBe("pro_online");
  });
});

describe("sameDayOpenTo", () => {
  it("tout fermé : aucune porte", () => {
    expect(sameDayOpenTo(CLOSED, "public_online")).toBe(false);
    expect(sameDayOpenTo(CLOSED, "pro_online")).toBe(false);
    expect(sameDayOpenTo(CLOSED, "counter")).toBe(false);
  });

  it("les particuliers ouverts n'ouvrent rien aux pros", () => {
    const settings = { ...CLOSED, sameDayPublicAllowed: true };
    expect(sameDayOpenTo(settings, "public_online")).toBe(true);
    expect(sameDayOpenTo(settings, "pro_online")).toBe(false);
    expect(sameDayOpenTo(settings, "counter")).toBe(false);
  });

  it("les pros sans l'option « en ligne » : le comptoir seulement", () => {
    const settings = { ...CLOSED, sameDayProAllowed: true };
    expect(sameDayOpenTo(settings, "counter")).toBe(true);
    expect(sameDayOpenTo(settings, "pro_online")).toBe(false);
  });

  it("l'option « en ligne » seule n'ouvre rien : elle prolonge « pros »", () => {
    expect(sameDayOpenTo({ ...CLOSED, sameDayProOnline: true }, "pro_online")).toBe(false);
    expect(
      sameDayOpenTo({ ...CLOSED, sameDayProAllowed: true, sameDayProOnline: true }, "pro_online"),
    ).toBe(true);
  });
});
