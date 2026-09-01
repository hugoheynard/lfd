import { InvalidCreditorIdentifierError } from "../../errors/accounting-errors.js";
import { CreditorIdentifier, ICS_FRENCH_LENGTH } from "../creditor-identifier.js";

/** Forme d'un ICS français : pays, clé, code activité, identifiant national. */
const FRENCH = "FR72ZZZ123456";

describe("CreditorIdentifier", () => {
  it("normalise la saisie espacée et la met en majuscules", () => {
    expect(CreditorIdentifier.create("fr72 zzz 123456").value).toBe(FRENCH);
  });

  it("découpe les quatre zones", () => {
    const ics = CreditorIdentifier.create(FRENCH);
    expect(ics.countryCode()).toBe("FR");
    expect(ics.businessCode()).toBe("ZZZ");
    expect(ics.nationalIdentifier()).toBe("123456");
  });

  it("refuse un SIRET collé dans le champ ICS", () => {
    // L'erreur réelle du chantier : deux identifiants de 13-14 caractères, tous
    // deux « officiels », dans deux champs voisins de la même fiche.
    expect(() => CreditorIdentifier.create("81245678900021")).toThrow(
      InvalidCreditorIdentifierError,
    );
  });

  it("refuse un ICS français de longueur inattendue", () => {
    expect(() => CreditorIdentifier.create("FR72ZZZ1234567")).toThrow(
      new RegExp(`${ICS_FRENCH_LENGTH} caractères`, "u"),
    );
  });

  it("accepte un ICS étranger de longueur différente", () => {
    // La règle de longueur fixe est FRANÇAISE : l'imposer partout refuserait un
    // créancier belge ou allemand légitime.
    expect(CreditorIdentifier.create("DE98ZZZ09999999999").countryCode()).toBe("DE");
  });

  it("refuse une forme qui n'a pas les quatre zones", () => {
    expect(() => CreditorIdentifier.create("FRZZZ123456")).toThrow(/deux chiffres de clé/u);
    expect(() => CreditorIdentifier.create("")).toThrow(InvalidCreditorIdentifierError);
  });
});
