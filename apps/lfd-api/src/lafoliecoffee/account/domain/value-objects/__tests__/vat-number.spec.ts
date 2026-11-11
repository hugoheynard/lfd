import { InvalidVatNumberError, VatSirenMismatchError } from "../../errors/account-errors.js";
import { ensureVatMatchesSiren, normalizedVatNumber } from "../vat-number.js";

describe("normalizedVatNumber", () => {
  it("rend la chaîne vide pour une saisie vide", () => {
    expect(normalizedVatNumber("   ")).toBe("");
  });

  it("accepte un numéro français dont la clé correspond au SIREN, normalisé", () => {
    expect(normalizedVatNumber(" fr 66 812.456.789 ")).toBe("FR66812456789");
  });

  it("refuse un numéro français dont la clé ne correspond pas au SIREN", () => {
    expect(() => normalizedVatNumber("FR32812456789")).toThrow(InvalidVatNumberError);
  });

  it("refuse un numéro français sans ses 9 chiffres de SIREN", () => {
    expect(() => normalizedVatNumber("FR99")).toThrow(InvalidVatNumberError);
  });

  it("accepte une clé française en lettres (ancien format) sur sa seule forme", () => {
    expect(normalizedVatNumber("FRAB812456789")).toBe("FRAB812456789");
  });

  it("accepte un numéro d'un autre pays sur sa forme", () => {
    expect(normalizedVatNumber("DE123456789")).toBe("DE123456789");
  });

  it("refuse ce qui n'a pas la forme d'un numéro intracommunautaire", () => {
    expect(() => normalizedVatNumber("abc")).toThrow(InvalidVatNumberError);
    expect(() => normalizedVatNumber("123456789")).toThrow(InvalidVatNumberError);
  });
});

describe("ensureVatMatchesSiren", () => {
  it("refuse un numéro français qui porte un autre SIREN", () => {
    expect(() => ensureVatMatchesSiren("FR32123456789", "812456789")).toThrow(
      VatSirenMismatchError,
    );
  });

  it("laisse passer le bon SIREN, un SIREN inconnu, ou un numéro étranger", () => {
    expect(() => ensureVatMatchesSiren("FR66812456789", "812456789")).not.toThrow();
    expect(() => ensureVatMatchesSiren("FR66812456789", "")).not.toThrow();
    expect(() => ensureVatMatchesSiren("DE123456789", "812456789")).not.toThrow();
  });
});
