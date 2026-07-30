import {
  InvalidCompanyIdentityError,
  InvalidEmailError,
  InvalidPersonNameError,
} from "../../errors/account-errors.js";
import { ContactDetails, type ContactDetailsInput } from "../contact-details.js";

const input: ContactDetailsInput = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "Responsable achats",
  email: "camille@pqmarais.fr",
  phone: "01 42 71 08 44",
};

describe("ContactDetails", () => {
  it("compose et normalise les coordonnées", () => {
    const details = ContactDetails.create({ ...input, firstName: "  Camille  " });

    expect(details.firstName.value).toBe("Camille");
    expect(details.email.value).toBe("camille@pqmarais.fr");
    expect(details.fonction).toBe("Responsable achats");
  });

  it("accepte une fonction vide", () => {
    // Tous les contacts n'ont pas de fonction déclarée.
    expect(ContactDetails.create({ ...input, fonction: "  " }).fonction).toBe("");
  });

  it("propage les refus des value objects sous-jacents", () => {
    expect(() => ContactDetails.create({ ...input, lastName: "" })).toThrow(InvalidPersonNameError);
    expect(() => ContactDetails.create({ ...input, email: "pas-un-email" })).toThrow(
      InvalidEmailError,
    );
  });

  it("borne la fonction", () => {
    expect(() => ContactDetails.create({ ...input, fonction: "x".repeat(200) })).toThrow(
      InvalidCompanyIdentityError,
    );
  });
});
