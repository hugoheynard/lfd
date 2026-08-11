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

  it("accepte un interlocuteur dont on ne connaît que l'adresse", () => {
    // Le commercial note l'e-mail au comptoir : c'est lui qui identifie la
    // personne et par lui qu'elle recevra son accès. Le nom se complète après.
    const contact = ContactDetails.create({ ...input, firstName: "", lastName: "" });

    expect(contact.firstName.value).toBe("");
    expect(contact.lastName.value).toBe("");
  });

  it("propage les refus des value objects sous-jacents", () => {
    // L'adresse, elle, reste obligatoire et vérifiée : sans elle, il n'y a
    // personne à joindre.
    expect(() => ContactDetails.create({ ...input, email: "pas-un-email" })).toThrow(
      InvalidEmailError,
    );
    // Facultatif ne veut pas dire libre : la borne de longueur tient.
    expect(() => ContactDetails.create({ ...input, lastName: "x".repeat(200) })).toThrow(
      InvalidPersonNameError,
    );
  });

  it("borne la fonction", () => {
    expect(() => ContactDetails.create({ ...input, fonction: "x".repeat(200) })).toThrow(
      InvalidCompanyIdentityError,
    );
  });
});
