import { InvalidCargoDimensionsError } from "../../errors/delivery-errors.js";
import { CargoSpace } from "../cargo-space.js";

describe("CargoSpace", () => {
  it("dérive le volume en litres, arrondi à l'entier inférieur", () => {
    expect(CargoSpace.of({ lengthCm: 330, widthCm: 170, heightCm: 176 }).volumeLiters).toBe(9873);
    expect(CargoSpace.of({ lengthCm: 1, widthCm: 1, heightCm: 999 }).volumeLiters).toBe(0);
  });

  it("accepte les bornes 1 et 1 000 cm", () => {
    expect(CargoSpace.of({ lengthCm: 1000, widthCm: 1, heightCm: 1000 }).toDimensions()).toEqual({
      lengthCm: 1000,
      widthCm: 1,
      heightCm: 1000,
    });
  });

  it.each([
    [{ lengthCm: 0, widthCm: 100, heightCm: 100 }, /longueur vaut 0 cm/u],
    [{ lengthCm: 100, widthCm: 1001, heightCm: 100 }, /largeur vaut 1001 cm/u],
    [{ lengthCm: 100, widthCm: 100, heightCm: 12.5 }, /hauteur vaut 12.5 cm/u],
    [{ lengthCm: 100, widthCm: -4, heightCm: 100 }, /largeur/u],
  ])("refuse %j, en nommant la dimension et le geste de sortie", (input, detail) => {
    expect(() => CargoSpace.of(input)).toThrow(InvalidCargoDimensionsError);
    expect(() => CargoSpace.of(input)).toThrow(detail);
    expect(() => CargoSpace.of(input)).toThrow(/laissez les trois vides/u);
  });
});
