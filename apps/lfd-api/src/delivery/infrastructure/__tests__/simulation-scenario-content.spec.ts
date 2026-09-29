import { rawCountOf, scenarioContentOf } from "../simulation-scenario-content.js";

const VALID = {
  stops: [{ id: "a", label: "Chez A", gps: { lat: 45.6, lng: 5.9 }, window: null }],
  vehicles: ["Kangoo"],
  settings: {
    earliestDeparture: "06:00",
    maxRoundMinutes: 240,
    stopMinutes: 5,
    defaultMode: "new_rounds",
    multiplePassages: true,
  },
  departure: null,
};

describe("scenarioContentOf — relire un scénario, c'est le revalider (L9-C7)", () => {
  it("rend le scénario valide tel quel", () => {
    expect(scenarioContentOf(VALID)).toEqual({ readable: true, payload: VALID });
  });

  it("rend un contenu devenu invalide comme illisible, en nommant le champ", () => {
    const content = scenarioContentOf({ ...VALID, stops: [] });

    expect(content).toEqual({ readable: false, reason: "stops : au moins un arrêt" });
  });

  it("n'échoue pas sur un contenu qui n'est même pas un objet", () => {
    expect(scenarioContentOf("n'importe quoi")).toMatchObject({ readable: false });
  });
});

describe("rawCountOf — compter sans relire", () => {
  it("compte un tableau, rend zéro sinon", () => {
    expect(rawCountOf(VALID, "stops")).toBe(1);
    expect(rawCountOf({ stops: "x" }, "stops")).toBe(0);
    expect(rawCountOf(null, "vehicles")).toBe(0);
  });
});
