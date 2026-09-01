import { InvalidRumError } from "../../errors/mandate-errors.js";
import { Rum, RUM_MAX_LENGTH, RUM_PREFIX } from "../rum.js";

/** Un ULID tel que `UlidGenerator` en rend : 26 caractères de base 32. */
const MANDATE_ID = "01JBXY7Z9K4M2N8P3Q5R7S9T1V";

describe("Rum", () => {
  it("dérive la référence de l'identifiant du mandat", () => {
    expect(Rum.forMandate(MANDATE_ID).value).toBe(`${RUM_PREFIX}${MANDATE_ID}`);
  });

  it("tient sous la borne EPC avec le préfixe", () => {
    // 3 + 26 = 29 : la marge existe, et ce test la surveille.
    expect(Rum.forMandate(MANDATE_ID).value.length).toBeLessThanOrEqual(RUM_MAX_LENGTH);
  });

  it("ne collisionne pas, parce que l'identifiant du mandat ne collisionne pas", () => {
    const first = Rum.forMandate("01JBXY7Z9K4M2N8P3Q5R7S9T1V");
    const second = Rum.forMandate("01JBXY7Z9K4M2N8P3Q5R7S9T1W");
    expect(first.value).not.toBe(second.value);
  });

  it("met en majuscules : une RUM se dicte au téléphone", () => {
    expect(Rum.forMandate("01jbxy7z9k4m2n8p3q5r7s9t1v").value).toBe(`${RUM_PREFIX}${MANDATE_ID}`);
  });

  it("refuse un identifiant de mandat vide", () => {
    expect(() => Rum.forMandate("   ")).toThrow(InvalidRumError);
  });

  it("relit une référence existante venue d'un fichier de retour", () => {
    expect(Rum.create("LFC-2024-000123").value).toBe("LFC-2024-000123");
  });

  it("refuse un caractère hors du jeu SEPA", () => {
    // Un accent passe la saisie et casse le fichier chez la banque.
    expect(() => Rum.create("LFC-RÉFÉRENCE-1")).toThrow(/jeu SEPA/u);
  });

  it("refuse une référence trop longue pour la norme", () => {
    expect(() => Rum.create("A".repeat(RUM_MAX_LENGTH + 1))).toThrow(
      new RegExp(`${RUM_MAX_LENGTH} caractères au maximum`, "u"),
    );
  });

  it("refuse une référence vide", () => {
    expect(() => Rum.create("  ")).toThrow(InvalidRumError);
  });
});
