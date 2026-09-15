import { InvalidSirenError } from "../../errors/account-errors.js";
import { Siren, SIREN_LENGTH } from "../siren.js";
import { Siret } from "../siret.js";

/** SIREN dont la clé de Luhn est correcte. */
const VALID = "812456788";

describe("Siren", () => {
  it("normalise la saisie espacée en 9 chiffres", () => {
    expect(Siren.create("812 456 788").value).toBe(VALID);
  });

  it("expose une forme lisible pour l'affichage", () => {
    expect(Siren.create(VALID).formatted()).toBe("812 456 788");
  });

  it("refuse ce qui n'est pas 9 chiffres, en nommant le cas", () => {
    expect(() => Siren.create("81245678")).toThrow(/9 chiffres attendus, 8 reçus/u);
    expect(() => Siren.create("8124567880")).toThrow(InvalidSirenError);
    expect(() => Siren.create("81245678O")).toThrow(/chiffres uniquement/u);
  });

  it("détecte TOUTE faute de frappe sur un seul chiffre", () => {
    for (let position = 0; position < SIREN_LENGTH; position++) {
      const original = Number(VALID[position]);
      for (let digit = 0; digit <= 9; digit++) {
        if (digit === original) {
          continue;
        }
        const altered = `${VALID.slice(0, position)}${String(digit)}${VALID.slice(position + 1)}`;
        expect(() => Siren.create(altered)).toThrow(/clé de contrôle/u);
      }
    }
  });

  it("refuse `000000000`, que la clé de Luhn laisse passer", () => {
    expect(() => Siren.create("000 000 000")).toThrow(/zéros/u);
  });

  it("lit une saisie vide comme « pas encore », et vérifie ce qui est saisi", () => {
    expect(Siren.createOptional("   ")).toBeNull();
    expect(Siren.createOptional("812 456 788")?.value).toBe(VALID);
    expect(() => Siren.createOptional("812456789")).toThrow(InvalidSirenError);
  });

  describe("prefixOf", () => {
    it("rend le SIREN d'un SIRET dont le préfixe est valide", () => {
      expect(Siren.prefixOf(Siret.create("81245678800023"))?.value).toBe(VALID);
    });

    /**
     * Régression : la clé d'un SIRET ne garantit pas celle de son préfixe. Tirer
     * `left(siret, 9)` écrivait `812456789`, que `Siren.create` refuse au
     * chargement suivant (vitruve §8.1, 2026-09-15).
     */
    it("rend null pour un SIRET valide dont le préfixe n'est pas un SIREN", () => {
      expect(Siret.create("81245678900021").value).toBe("81245678900021");
      expect(Siren.prefixOf(Siret.create("81245678900021"))).toBeNull();
    });
  });
});
