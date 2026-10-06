import {
  BinInnerExceedsOuterError,
  InvalidBinDimensionsError,
  InvalidBinMaxStackError,
} from "../../errors/delivery-bin-errors.js";
import { BinFormat } from "../bin-format.js";

const MANNE = {
  outer: { lengthMm: 665, widthMm: 460, heightMm: 715 },
  inner: { lengthMm: 645, widthMm: 440, heightMm: 695 },
  maxStack: 1,
};

describe("BinFormat — un format essayé dans l'assistant, au millimètre", () => {
  /**
   * Régression : l'assistant se mesurait en cm entiers, et pré-remplir un
   * format depuis la manne à pain (66,5 cm) était refusé (400, 2026-10-06).
   */
  it("accepte la manne à pain au demi-centimètre", () => {
    const format = BinFormat.of(MANNE);

    expect(format.outer.toInput()).toEqual(MANNE.outer);
    expect(format.inner.toInput()).toEqual(MANNE.inner);
    expect(format.maxStack).toBe(1);
  });

  it.each([
    ["sous 1 cm", { ...MANNE, outer: { ...MANNE.outer, heightMm: 9 } }, InvalidBinDimensionsError],
    [
      "au-delà de 3 m",
      { ...MANNE, outer: { ...MANNE.outer, lengthMm: 3001 } },
      InvalidBinDimensionsError,
    ],
    [
      "une fraction de mm",
      { ...MANNE, inner: { ...MANNE.inner, widthMm: 440.5 } },
      InvalidBinDimensionsError,
    ],
    [
      "un intérieur plus haut d'un mm",
      { ...MANNE, inner: { ...MANNE.inner, heightMm: 716 } },
      BinInnerExceedsOuterError,
    ],
    ["une pile nulle", { ...MANNE, maxStack: 0 }, InvalidBinMaxStackError],
  ])("refuse %s", (_case, input, error) => {
    expect(() => BinFormat.of(input)).toThrow(error);
  });

  it("nomme le refus d'intérieur en centimètres à une décimale", () => {
    expect(() => BinFormat.of({ ...MANNE, inner: { ...MANNE.inner, lengthMm: 666 } })).toThrow(
      /66,6 cm/,
    );
  });
});
