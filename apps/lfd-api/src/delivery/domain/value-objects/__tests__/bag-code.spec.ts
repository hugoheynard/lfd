import { InvalidBagCodeError } from "../../errors/delivery-loading-errors.js";
import { BAG_CODE_ALPHABET, BAG_CODE_LENGTH, bagCodeOf } from "../bag-code.js";

describe("bagCodeOf — L4-C20", () => {
  it("l'alphabet est Crockford base 32 : 32 signes, sans I, L, O, U", () => {
    expect(new Set(BAG_CODE_ALPHABET).size).toBe(32);
    expect(BAG_CODE_ALPHABET).not.toMatch(/[ILOU]/u);
    expect(BAG_CODE_LENGTH).toBe(6);
  });

  it("normalise un code tapé en minuscules, espaces autour", () => {
    expect(bagCodeOf("  7k2m9x ")).toBe("7K2M9X");
  });

  it.each(["", "ABCDE", "ABCDEFG", "ABCDEI", "ABCDEL", "ABCDEO", "ABCDEU", "ABC-DE"])(
    "refuse « %s »",
    (raw) => {
      expect(() => bagCodeOf(raw)).toThrow(InvalidBagCodeError);
    },
  );
});
