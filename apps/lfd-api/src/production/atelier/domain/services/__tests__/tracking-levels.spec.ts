import {
  DETAILED_DAY,
  type DayTrackingLevels,
  dayLevelsOf,
  isUniform,
  lineLevelOf,
  mustFreeze,
  resolvedLevels,
} from "../tracking-levels.js";

/**
 * **Le niveau de suivi d'une journée et de ses lignes** (plan
 * `fournil/plan-niveaux-de-suivi.md`, § 3.1). Ces instants ne sont comparés
 * qu'entre eux (la mise en service et l'arrêt), jamais à l'horloge.
 */
const SINCE = new Date("2026-12-01T00:00:00.000Z");
const BEFORE = new Date("2026-11-30T20:00:00.000Z");
const AFTER = new Date("2026-12-02T20:00:00.000Z");

const PASTRY = "ws-pastry";
const BREAD = "ws-bread";

const FROZEN: DayTrackingLevels = {
  house: "simple",
  workstations: new Map([[PASTRY, "detailed"]]),
};

describe("resolvedLevels — chaque poste résolu à cet instant", () => {
  it("un poste sans réglage propre suit le fournil, un poste réglé garde le sien", () => {
    const levels = resolvedLevels("always_green", [
      { id: PASTRY, trackingLevel: "detailed" },
      { id: BREAD, trackingLevel: null },
    ]);

    expect(levels.house).toBe("always_green");
    expect([...levels.workstations]).toEqual([
      [PASTRY, "detailed"],
      [BREAD, "always_green"],
    ]);
  });
});

describe("lineLevelOf — le niveau d'une ligne", () => {
  it("celui de son poste, sinon celui du fournil", () => {
    expect(lineLevelOf(FROZEN, PASTRY)).toBe("detailed");
    expect(lineLevelOf(FROZEN, null)).toBe("simple");
    expect(lineLevelOf(FROZEN, undefined)).toBe("simple");
  });

  it("un poste inconnu de la journée (créé depuis le figement) suit le fournil", () => {
    expect(lineLevelOf(FROZEN, "ws-new")).toBe("simple");
  });
});

describe("mustFreeze — le premier passage d'une journée arrêtée", () => {
  it("fige une journée arrêtée depuis la mise en service, sans niveau figé", () => {
    expect(mustFreeze({ closedAt: AFTER }, null, SINCE)).toBe(true);
  });

  it("ne fige jamais une journée ouverte", () => {
    expect(mustFreeze({ closedAt: null }, null, SINCE)).toBe(false);
  });

  it("ne fige pas deux fois : le premier niveau reste", () => {
    expect(mustFreeze({ closedAt: AFTER }, FROZEN, SINCE)).toBe(false);
  });

  it("ne fige jamais une journée arrêtée avant la mise en service", () => {
    expect(mustFreeze({ closedAt: BEFORE }, null, SINCE)).toBe(false);
  });

  it("une journée arrêtée à l'instant même de la mise en service la suit", () => {
    expect(mustFreeze({ closedAt: SINCE }, null, SINCE)).toBe(true);
  });
});

describe("dayLevelsOf — ce que la journée sert", () => {
  const CURRENT = resolvedLevels("always_green", []);

  it("le niveau figé, jamais le réglage courant", () => {
    expect(dayLevelsOf({ closedAt: AFTER }, FROZEN, SINCE, CURRENT)).toBe(FROZEN);
  });

  it("une journée arrêtée avant la mise en service : détaillé, quoi que dise le réglage", () => {
    expect(dayLevelsOf({ closedAt: BEFORE }, null, SINCE, CURRENT)).toBe(DETAILED_DAY);
  });

  it("une journée pas encore figée sert ce que le premier passage figera", () => {
    expect(dayLevelsOf({ closedAt: AFTER }, null, SINCE, CURRENT)).toBe(CURRENT);
    expect(dayLevelsOf({ closedAt: null }, null, SINCE, CURRENT)).toBe(CURRENT);
  });
});

describe("isUniform — faut-il lire le poste des articles ?", () => {
  it("non quand chaque poste est au niveau du fournil", () => {
    expect(isUniform(resolvedLevels("simple", [{ id: BREAD, trackingLevel: null }]))).toBe(true);
    expect(isUniform(DETAILED_DAY)).toBe(true);
  });

  it("oui dès qu'un poste a le sien", () => {
    expect(isUniform(FROZEN)).toBe(false);
  });
});
