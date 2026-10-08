import { autopilotTurn } from "../collection-autopilot.js";

/**
 * Le cycle de septembre se clôt le 1er octobre 2026 à 00h00 de Paris
 * (22h00 UTC la veille). Les instants ne sont comparés qu'à cette clôture,
 * jamais au mur.
 */
const SEPTEMBER_CLOSE = new Date("2026-09-30T22:00:00.000Z");

describe("le tour de l'automatisme (PA3)", () => {
  it("vise le dernier cycle clos, comme le bouton", () => {
    const turn = autopilotTurn(new Date("2026-10-01T08:00:00.000Z"), 1);

    expect(turn.cycleClosesAt).toEqual(SEPTEMBER_CLOSE);
    expect(turn.plannedConstitutionAt).toEqual(new Date("2026-09-30T23:00:00.000Z"));
  });

  it("n'agit pas avant la clôture + le délai", () => {
    expect(autopilotTurn(new Date("2026-09-30T22:30:00.000Z"), 1).due).toBe(false);
    expect(autopilotTurn(new Date("2026-10-01T01:59:00.000Z"), 4).due).toBe(false);
  });

  it("agit à l'heure prévue, et après", () => {
    expect(autopilotTurn(new Date("2026-09-30T23:00:00.000Z"), 1).due).toBe(true);
    expect(autopilotTurn(new Date("2026-10-20T10:00:00.000Z"), 1).due).toBe(true);
  });

  it("la clé du cycle ne bouge pas d'un passage à l'autre du même mois", () => {
    const early = autopilotTurn(new Date("2026-10-01T00:15:00.000Z"), 1);
    const late = autopilotTurn(new Date("2026-10-31T21:15:00.000Z"), 1);

    expect(late.cycleClosesAt).toEqual(early.cycleClosesAt);
  });
});
