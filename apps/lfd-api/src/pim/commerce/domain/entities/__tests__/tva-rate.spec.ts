import { EmptyTvaRateNameError } from "../../errors/commerce-errors.js";
import { InvalidTvaPercentError } from "../../value-objects/tva-percent.js";
import { TvaRate } from "../tva-rate.js";

const OPEN = { id: "tva_1", name: "Réduit", description: "Alimentaire", percent: 5.5 };

describe("l’agrégat TvaRate", () => {
  it("refuse un taux impossible", () => {
    expect(() => TvaRate.open({ ...OPEN, percent: 0 })).toThrow(InvalidTvaPercentError);
  });

  it("refuse un nom vide, à l’ouverture comme à la révision", () => {
    expect(() => TvaRate.open({ ...OPEN, name: "   " })).toThrow(EmptyTvaRateNameError);
    expect(() => TvaRate.open(OPEN).revise({ name: "  ", description: "", percent: 10 })).toThrow(
      EmptyTvaRateNameError,
    );
  });

  it("rogne les blancs autour du nom et de la description", () => {
    const snapshot = TvaRate.open({
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
    expect(() => TvaRate.reconstitute({ ...OPEN, percent: 0 })).toThrow(InvalidTvaPercentError);
  });

  it("révise son taux", () => {
    const rate = TvaRate.open(OPEN);
    rate.revise({ name: "Intermédiaire", description: "", percent: 10 });
    expect(rate.snapshot()).toMatchObject({ name: "Intermédiaire", percent: 10 });
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = TvaRate.open(OPEN).snapshot();
    expect(TvaRate.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});
