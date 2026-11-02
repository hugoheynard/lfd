import { sameDayDoorOf, sameDayOpenTo, type SameDayDoorSettings } from "../same-day-doors.js";

/**
 * Le jour même par clientèle (plan `jour-meme-sur-stock.md`, lot
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

/**
 * La matrice complète : chaque porte × chacun des 8 états des trois
 * réglages. Les cas isolés plus haut laissent passer une combinaison ; celle-ci
 * énonce la règle (public = « particuliers » ; comptoir = « pros » ; pro en
 * ligne = « pros » ET « en ligne ») et se compare à elle.
 */
describe("sameDayOpenTo — chaque porte × chaque réglage", () => {
  const states = [false, true].flatMap((sameDayPublicAllowed) =>
    [false, true].flatMap((sameDayProAllowed) =>
      [false, true].map((sameDayProOnline) => ({
        sameDayPublicAllowed,
        sameDayProAllowed,
        sameDayProOnline,
      })),
    ),
  );

  it.each(states)("réglages %j", (settings) => {
    expect(sameDayOpenTo(settings, "public_online")).toBe(settings.sameDayPublicAllowed);
    expect(sameDayOpenTo(settings, "counter")).toBe(settings.sameDayProAllowed);
    expect(sameDayOpenTo(settings, "pro_online")).toBe(
      settings.sameDayProAllowed && settings.sameDayProOnline,
    );
  });

  it("l'équipe qui saisit pour un particulier sans société passe quand même par le comptoir", () => {
    expect(sameDayDoorOf(null, true)).toBe("counter");
  });
});
