import {
  ShortfallLetterRequiredError,
  ShortfallLetterTooLongError,
} from "../../errors/shortfall-letter-errors.js";
import { SHORTFALL_LETTER_MAX_LENGTH, ShortfallLetter } from "../shortfall-letter.js";

describe("ShortfallLetter — le texte relu qui part (E6d)", () => {
  it("garde le texte, sans ses espaces de bord", () => {
    expect(ShortfallLetter.of("  Bonjour,\n\nIl manque deux croissants.  ").text).toBe(
      "Bonjour,\n\nIl manque deux croissants.",
    );
  });

  it("refuse un texte vide ou blanc", () => {
    expect(() => ShortfallLetter.of(" \n ")).toThrow(ShortfallLetterRequiredError);
  });

  it("refuse un texte trop long, et admet la borne", () => {
    expect(ShortfallLetter.of("a".repeat(SHORTFALL_LETTER_MAX_LENGTH)).text).toHaveLength(
      SHORTFALL_LETTER_MAX_LENGTH,
    );
    expect(() => ShortfallLetter.of("a".repeat(SHORTFALL_LETTER_MAX_LENGTH + 1))).toThrow(
      ShortfallLetterTooLongError,
    );
  });
});
