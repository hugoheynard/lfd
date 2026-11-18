import {
  DETAILED_DAY,
  type DayTrackingLevels,
  dayLevelsOf,
  isUniform,
  lineLevelOf,
  mustFreeze,
  resolvedLevels,
  servedBeforeService,
} from "../tracking-levels.js";

/**
 * **Le niveau de suivi d'une journée et de ses lignes** (
 * `fournil/les-niveaux-de-suivi.md`). Ces instants ne sont comparés
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
    expect(dayLevelsOf({ closedAt: AFTER }, FROZEN, SINCE, AFTER, CURRENT)).toBe(FROZEN);
  });

  it("une journée arrêtée avant la mise en service : détaillé, quoi que dise le réglage", () => {
    expect(dayLevelsOf({ closedAt: BEFORE }, null, SINCE, AFTER, CURRENT)).toBe(DETAILED_DAY);
  });

  it("une journée pas encore figée sert ce que le premier passage figera", () => {
    expect(dayLevelsOf({ closedAt: AFTER }, null, SINCE, AFTER, CURRENT)).toBe(CURRENT);
    expect(dayLevelsOf({ closedAt: null }, null, SINCE, AFTER, CURRENT)).toBe(CURRENT);
  });

  /**
   * Régression : une journée pas encore arrêtée servait le réglage courant
   * (toujours vert) avant la mise en service, et la fiche du jour quittait le
   * détaillé.
   */
  it("une journée ouverte avant la mise en service : détaillé", () => {
    expect(dayLevelsOf({ closedAt: null }, null, SINCE, BEFORE, CURRENT)).toBe(DETAILED_DAY);
  });
});

describe("servedBeforeService — l'arrêt, sinon l'instant présent", () => {
  it("une journée arrêtée se juge sur son arrêt, pas sur l'instant présent", () => {
    expect(servedBeforeService({ closedAt: BEFORE }, SINCE, AFTER)).toBe(true);
    expect(servedBeforeService({ closedAt: AFTER }, SINCE, BEFORE)).toBe(false);
  });

  it("une journée ouverte se juge sur l'instant présent", () => {
    expect(servedBeforeService({ closedAt: null }, SINCE, BEFORE)).toBe(true);
    expect(servedBeforeService({ closedAt: null }, SINCE, SINCE)).toBe(false);
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
