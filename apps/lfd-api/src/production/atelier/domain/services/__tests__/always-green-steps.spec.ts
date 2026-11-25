import { localToInstant } from "@lfd/contracts";

import { type AlwaysGreenStepLine, alwaysGreenStepCheck } from "../always-green-steps.js";

/**
 * L'étape en toujours vert (`fournil/un-produit-sur-plusieurs-postes.md`,
 * § 2.4) : cochée d'un coup quand tous les paliers à heure de la ligne sont
 * échus, marge comprise. Les dates ne sont comparées qu'à un instant
 * construit sur la même journée.
 */
const DAY = "2030-03-12";
const at = (time: string): Date => {
  const instant = localToInstant(DAY, time);
  if (instant === null) {
    throw new RangeError(`heure ${time} introuvable le ${DAY}`);
  }
  return instant;
};

const TIMED = [
  { quantity: 120, before: "07:00" },
  { quantity: 80, before: "11:00" },
];

const LINE: AlwaysGreenStepLine = { serviceDay: DAY, deadlines: TIMED, marginMinutes: 15 };

describe("alwaysGreenStepCheck", () => {
  it("rien tant que le dernier palier à heure n'est pas échu, marge comprise", () => {
    expect(alwaysGreenStepCheck(LINE, at("07:30"))).toBe("nothing");
    expect(alwaysGreenStepCheck(LINE, at("11:14"))).toBe("nothing");
  });

  it("cochée quand tous les paliers à heure sont échus", () => {
    expect(alwaysGreenStepCheck(LINE, at("11:15"))).toBe("check");
  });

  it("un palier « la journée » n'est pas attendu à côté de paliers à heure", () => {
    const line = { ...LINE, deadlines: [...TIMED, { quantity: 10, before: null }] };

    expect(alwaysGreenStepCheck(line, at("11:15"))).toBe("check");
  });

  it("sans palier à heure, ou paliers illisibles : à confirmer", () => {
    expect(
      alwaysGreenStepCheck({ ...LINE, deadlines: [{ quantity: 5, before: null }] }, at("23:00")),
    ).toBe("no_deadline");
    expect(alwaysGreenStepCheck({ ...LINE, deadlines: [] }, at("23:00"))).toBe("no_deadline");
    expect(alwaysGreenStepCheck({ ...LINE, deadlines: null }, at("23:00"))).toBe("no_deadline");
  });
});
