import { EmptyTvaRegimeNameError } from "../../errors/commerce-errors.js";
import { InvalidTvaRateError } from "../../value-objects/tva-rate.js";
import { TvaRegime } from "../tva-regime.js";

const OPEN = { id: "tva_1", name: "Réduit", description: "Alimentaire", percent: 5.5 };

describe("l’agrégat TvaRegime", () => {
  it("refuse un taux impossible", () => {
    expect(() => TvaRegime.open({ ...OPEN, percent: 0 })).toThrow(InvalidTvaRateError);
  });

  it("refuse un nom vide, à l’ouverture comme à la révision", () => {
    expect(() => TvaRegime.open({ ...OPEN, name: "   " })).toThrow(EmptyTvaRegimeNameError);
    expect(() => TvaRegime.open(OPEN).revise("  ", "", 10)).toThrow(EmptyTvaRegimeNameError);
  });

  it("rogne les blancs autour du nom et de la description", () => {
    const snapshot = TvaRegime.open({
      ...OPEN,
      name: "  Réduit  ",
      description: "  x ",
    }).snapshot();
    expect(snapshot.name).toBe("Réduit");
    expect(snapshot.description).toBe("x");
  });

  /**
   * Le taux repasse par son VO à la reconstitution : une ligne écrite avant que
   * la règle existe se signale ici, plutôt que de ressortir vers un canal.
   */
  it("refuse à la reconstitution un taux que la base n’aurait pas dû porter", () => {
    expect(() => TvaRegime.reconstitute({ ...OPEN, percent: 0 })).toThrow(InvalidTvaRateError);
  });

  it("révise son taux", () => {
    const regime = TvaRegime.open(OPEN);
    regime.revise("Intermédiaire", "", 10);
    expect(regime.snapshot()).toMatchObject({ name: "Intermédiaire", percent: 10 });
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = TvaRegime.open(OPEN).snapshot();
    expect(TvaRegime.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});
