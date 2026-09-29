import { InvalidBinCodeError } from "../../errors/delivery-loading-errors.js";
import { BIN_CODE_ALPHABET, BIN_CODE_LENGTH, binCodeOf } from "../bin-code.js";

describe("binCodeOf — L4-C20", () => {
  it("l'alphabet est Crockford base 32 : 32 signes, sans I, L, O, U", () => {
    expect(new Set(BIN_CODE_ALPHABET).size).toBe(32);
    expect(BIN_CODE_ALPHABET).not.toMatch(/[ILOU]/u);
    expect(BIN_CODE_LENGTH).toBe(6);
  });

  it("normalise un code tapé en minuscules, espaces autour", () => {
    expect(binCodeOf("  7k2m9x ")).toBe("7K2M9X");
  });

  it.each(["", "ABCDE", "ABCDEFG", "ABCDEI", "ABCDEL", "ABCDEO", "ABCDEU", "ABC-DE"])(
    "refuse « %s »",
    (raw) => {
      expect(() => binCodeOf(raw)).toThrow(InvalidBinCodeError);
    },
  );
});
