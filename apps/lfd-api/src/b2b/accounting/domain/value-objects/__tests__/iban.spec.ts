import { InvalidIbanError } from "../../errors/accounting-errors.js";
import { Iban } from "../iban.js";

/** IBAN d'exemple de la documentation bancaire française — clé mod-97 correcte. */
const VALID_FR = "FR1420041010050500013M02606";

describe("Iban", () => {
  it("normalise la saisie espacée et la met en majuscules", () => {
    // Un RIB se recopie par groupes de quatre ; stocker la forme brute ferait
    // deux comptes différents du même compte.
    expect(Iban.create("fr14 2004 1010 0505 0001 3m02 606").value).toBe(VALID_FR);
  });

  it("accepte des IBAN de longueurs différentes selon le pays", () => {
    expect(Iban.create("DE89370400440532013000").countryCode()).toBe("DE");
    expect(Iban.create("BE68539007547034").countryCode()).toBe("BE");
    expect(Iban.create("GB82WEST12345698765432").countryCode()).toBe("GB");
  });

  it("refuse un IBAN dont le dernier chiffre a été mal recopié", () => {
    // C'est LA faute que la clé existe pour attraper : sans elle, la ligne part
    // dans un lot et la banque la rejette cinq jours plus tard.
    expect(() => Iban.create("FR1420041010050500013M02607")).toThrow(InvalidIbanError);
  });

  it("refuse une forme qui n'est pas un IBAN", () => {
    expect(() => Iban.create("1420041010050500013M02606")).toThrow(/deux lettres de pays/u);
    expect(() => Iban.create("FRXX20041010050500013M0260")).toThrow(/deux lettres de pays/u);
    expect(() => Iban.create("")).toThrow(InvalidIbanError);
  });

  it("refuse une longueur hors des bornes de la norme", () => {
    expect(() => Iban.create("FR1420041010")).toThrow(/longueur hors bornes/u);
  });

  it("ne laisse sortir que de quoi reconnaître le compte", () => {
    const iban = Iban.create(VALID_FR);
    expect(iban.last4()).toBe("2606");
    expect(iban.masked()).toBe("••••••••2606");
    expect(iban.masked()).not.toContain("20041010");
  });

  it("expose une forme lisible par groupes de quatre", () => {
    expect(Iban.create(VALID_FR).formatted()).toBe("FR14 2004 1010 0505 0001 3M02 606");
  });
});
