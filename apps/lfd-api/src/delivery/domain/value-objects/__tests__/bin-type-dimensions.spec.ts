import { InvalidBinDimensionsError } from "../../errors/delivery-bin-errors.js";
import { BinTypeDimensions, centimetresLabel } from "../bin-type-dimensions.js";

describe("BinTypeDimensions", () => {
  it("garde le millimètre et en dérive les litres, arrondis à l'inférieur", () => {
    const dims = BinTypeDimensions.of("intérieures", {
      lengthMm: 645,
      widthMm: 440,
      heightMm: 695,
    });

    expect(dims.toInput()).toEqual({ lengthMm: 645, widthMm: 440, heightMm: 695 });
    expect(dims.volumeLiters).toBe(197); // 197 241 000 mm³
  });

  it.each([9, 3001, 66.5, Number.NaN])("refuse %s mm", (lengthMm) => {
    expect(() =>
      BinTypeDimensions.of("extérieures", { lengthMm, widthMm: 400, heightMm: 220 }),
    ).toThrow(InvalidBinDimensionsError);
  });
});

describe("centimetresLabel", () => {
  it.each([
    [665, "66,5 cm"],
    [460, "46 cm"],
    [10, "1 cm"],
    [3000, "300 cm"],
    [5, "0,5 cm"],
  ])("%i mm s'écrit « %s »", (mm, label) => {
    expect(centimetresLabel(mm)).toBe(label);
  });
});
