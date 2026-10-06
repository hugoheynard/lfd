import { isLuhnValid } from "../../../b2b/account/domain/value-objects/luhn.js";
import { Siret } from "../../../b2b/account/domain/value-objects/siret.js";
import { fictiveRegistration, luhnCheckDigit } from "../fictive-registration.js";

describe("fictiveRegistration", () => {
  it("rend un SIRET que le value object accepte, et dont le SIREN passe Luhn", () => {
    for (let rank = 0; rank < 40; rank += 1) {
      const { siret } = fictiveRegistration(rank);
      expect(() => Siret.create(siret)).not.toThrow();
      expect(isLuhnValid(siret.slice(0, 9))).toBe(true);
    }
  });

  it("porte la clé TVA du SIREN", () => {
    const { siret, vatNumber } = fictiveRegistration(4);
    const siren = siret.slice(0, 9);
    const key = (12 + 3 * (Number(siren) % 97)) % 97;
    expect(vatNumber).toBe(`FR${String(key).padStart(2, "0")}${siren}`);
  });

  it("ne donne jamais deux fois le même SIRET", () => {
    const sirets = Array.from({ length: 40 }, (_, rank) => fictiveRegistration(rank).siret);
    expect(new Set(sirets).size).toBe(40);
  });

  it("calcule la clé de Luhn d'un radical connu", () => {
    // 73282932 → 0 : le SIREN 732829320 est un exemple classique de l'INSEE.
    expect(luhnCheckDigit("73282932")).toBe("0");
  });
});
