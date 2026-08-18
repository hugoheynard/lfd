import { InvalidPhoneError } from "../../errors/account-errors.js";
import { PhoneNumber } from "../phone-number.js";

describe("PhoneNumber", () => {
  it("traite le vide comme « non renseigné », pas comme une erreur", () => {
    expect(PhoneNumber.create("").isEmpty).toBe(true);
    expect(PhoneNumber.create("   ").isEmpty).toBe(true);
  });

  it("conserve la saisie de l'utilisateur", () => {
    // C'est un libellé de contact, pas une clé : reformater casserait des numéros
    // internationaux légitimes.
    expect(PhoneNumber.create("+33 6 12 34 56 78").value).toBe("+33 6 12 34 56 78");
    expect(PhoneNumber.create("01 42 71 08 44").value).toBe("01 42 71 08 44");
    expect(PhoneNumber.create("(01) 42.71.08.44").value).toBe("(01) 42.71.08.44");
  });

  it("refuse ce qui ne peut pas être un numéro", () => {
    expect(() => PhoneNumber.create("01 42")).toThrow(InvalidPhoneError);
    expect(() => PhoneNumber.create("appelez-moi")).toThrow(InvalidPhoneError);
    expect(() => PhoneNumber.create("1234567890123456")).toThrow(/au plus 15 chiffres/u);
  });
});
