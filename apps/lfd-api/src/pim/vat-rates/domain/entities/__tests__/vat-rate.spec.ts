import { EmptyVatRateNameError } from "../../errors/vat-rate-errors.js";
import { InvalidVatPercentError } from "../../value-objects/vat-percent.js";
import { VatRate } from "../vat-rate.js";

const OPEN = { id: "tva_1", name: "Réduit", description: "Alimentaire", percent: 5.5 };

describe("l’agrégat VatRate", () => {
  it("refuse un taux impossible", () => {
    expect(() => VatRate.open({ ...OPEN, percent: 0 })).toThrow(InvalidVatPercentError);
  });

  it("refuse un nom vide, à l’ouverture comme à la révision", () => {
    expect(() => VatRate.open({ ...OPEN, name: "   " })).toThrow(EmptyVatRateNameError);
    expect(() => VatRate.open(OPEN).revise({ name: "  ", description: "", percent: 10 })).toThrow(
      EmptyVatRateNameError,
    );
  });

  it("rogne les blancs autour du nom et de la description", () => {
    const snapshot = VatRate.open({
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
    expect(() => VatRate.reconstitute({ ...OPEN, percent: 0 })).toThrow(InvalidVatPercentError);
  });

  it("révise son taux", () => {
    const rate = VatRate.open(OPEN);
    rate.revise({ name: "Intermédiaire", description: "", percent: 10 });
    expect(rate.snapshot()).toMatchObject({ name: "Intermédiaire", percent: 10 });
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = VatRate.open(OPEN).snapshot();
    expect(VatRate.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});
