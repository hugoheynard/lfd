import { InvalidSirenError } from "../../errors/accounting-errors.js";
import { Siren, SIREN_LENGTH } from "../siren.js";

/** SIREN dont la clé de Luhn est correcte. */
const VALID = "552100554";

describe("Siren", () => {
  it("normalise la saisie espacée en 9 chiffres", () => {
    expect(Siren.create("552 100 554").value).toBe(VALID);
  });

  it("expose une forme lisible pour l'affichage", () => {
    expect(Siren.create(VALID).formatted()).toBe("552 100 554");
  });

  it("refuse une clé de Luhn fausse", () => {
    expect(() => Siren.create("552100555")).toThrow(/clé de contrôle/u);
  });

  it("refuse un SIRET saisi dans le champ SIREN", () => {
    // La confusion réelle : 14 chiffres au lieu de 9, avec une clé valide.
    expect(() => Siren.create("81245678900021")).toThrow(
      new RegExp(`${SIREN_LENGTH} chiffres attendus`, "u"),
    );
  });

  it("refuse un SIREN de zéros, que la clé de Luhn accepte pourtant", () => {
    // Somme nulle donc multiple de 10 : Luhn dit oui. C'est le remplissage qu'on
    // tape pour « avancer », et il finirait imprimé sur une facture.
    expect(() => Siren.create("000000000")).toThrow(/zéros/u);
  });

  it("refuse ce qui n'est pas numérique", () => {
    expect(() => Siren.create("55210055A")).toThrow(InvalidSirenError);
    expect(() => Siren.create("")).toThrow(InvalidSirenError);
  });
});
