import { InvalidRefrigerationError } from "../../errors/delivery-errors.js";
import { RefrigeratedCompartment } from "../refrigerated-compartment.js";

describe("RefrigeratedCompartment", () => {
  it("accepte une caisse négative et les bornes exactes", () => {
    expect(
      RefrigeratedCompartment.of({ volumeLiters: 1, minTempC: -30, maxTempC: -18 }).toSpec(),
    ).toEqual({ volumeLiters: 1, minTempC: -30, maxTempC: -18 });
    expect(
      RefrigeratedCompartment.of({ volumeLiters: 20_000, minTempC: 15, maxTempC: 15 }).toSpec(),
    ).toEqual({ volumeLiters: 20_000, minTempC: 15, maxTempC: 15 });
  });

  it.each([
    [{ volumeLiters: 0, minTempC: 0, maxTempC: 4 }, /volume réfrigéré vaut 0 L/u],
    [{ volumeLiters: 20_001, minTempC: 0, maxTempC: 4 }, /volume réfrigéré/u],
    [{ volumeLiters: 10.5, minTempC: 0, maxTempC: 4 }, /volume réfrigéré/u],
    [{ volumeLiters: 400, minTempC: -31, maxTempC: 4 }, /minimale vaut -31 °C/u],
    [{ volumeLiters: 400, minTempC: 0, maxTempC: 16 }, /maximale vaut 16 °C/u],
    [{ volumeLiters: 400, minTempC: 0.5, maxTempC: 4 }, /minimale/u],
    [{ volumeLiters: 400, minTempC: 5, maxTempC: 4 }, /au-dessus de la maximale/u],
  ])("refuse %j, en nommant la saisie et le geste de sortie", (input, detail) => {
    expect(() => RefrigeratedCompartment.of(input)).toThrow(InvalidRefrigerationError);
    expect(() => RefrigeratedCompartment.of(input)).toThrow(detail);
    expect(() => RefrigeratedCompartment.of(input)).toThrow(/déclarez le véhicule sec/u);
  });
});
