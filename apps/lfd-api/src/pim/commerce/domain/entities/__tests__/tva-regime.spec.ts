import { EmptyTvaRegimeNameError } from "../../errors/commerce-errors.js";
import { InvalidTvaRateError } from "../../value-objects/tva-rate.js";
import { TvaRegime } from "../tva-regime.js";

const OPEN = { id: "tva_1", name: "Réduit", description: "Alimentaire", percent: 5.5 };

describe("l’agrégat TvaRegime", () => {
  it("dérive son tag du taux, à l’ouverture comme à la révision", () => {
    const regime = TvaRegime.open(OPEN);
    expect(regime.tag).toBe("tva-5-5");

    regime.revise("Intermédiaire", "", 10);
    expect(regime.tag).toBe("tva-10");
  });

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
   * Le tag n'est jamais relu de la base : il est recalculé. Une ligne dont le
   * tag aurait dérivé du taux se corrige donc au premier enregistrement, au
   * lieu de partir telle quelle chez Shopify.
   */
  it("recalcule le tag à la reconstitution plutôt que de croire la colonne", () => {
    const regime = TvaRegime.reconstitute({ ...OPEN, tag: "tva-menteur" });
    expect(regime.snapshot().tag).toBe("tva-5-5");
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = TvaRegime.open(OPEN).snapshot();
    expect(TvaRegime.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});
