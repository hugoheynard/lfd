import { InvalidCompanyIdentityError } from "../../errors/account-errors.js";
import { EmailAddress } from "../../value-objects/email-address.js";
import { PersonName } from "../../value-objects/person-name.js";
import { PhoneNumber } from "../../value-objects/phone-number.js";
import { Company, type CompanyContact, type CompanyIdentityInput } from "../company.js";

const contact: CompanyContact = {
  firstName: PersonName.create("Camille", "Prénom"),
  lastName: PersonName.create("Rousseau", "Nom"),
  fonction: "",
  email: EmailAddress.create("camille@pqmarais.fr"),
  phone: PhoneNumber.create("01 42 71 08 44"),
};

const identity: CompanyIdentityInput = {
  raisonSociale: "Boulangerie du Marais SAS",
  enseigne: "Le Pain Quotidien du Marais",
  formeJuridique: "SAS",
  siret: "812 456 789 00021",
  tvaIntracom: "FR32812456789",
};

describe("Company.declare", () => {
  it("normalise les textes et le SIRET", () => {
    const company = Company.declare(
      { ...identity, raisonSociale: "  Boulangerie   du Marais SAS " },
      contact,
    );

    expect(company.raisonSociale).toBe("Boulangerie du Marais SAS");
    expect(company.siret.value).toBe("81245678900021");
  });

  it("exige la raison sociale et la forme juridique", () => {
    expect(() => Company.declare({ ...identity, raisonSociale: "   " }, contact)).toThrow(
      InvalidCompanyIdentityError,
    );
    expect(() => Company.declare({ ...identity, formeJuridique: "" }, contact)).toThrow(
      InvalidCompanyIdentityError,
    );
  });

  it("accepte une enseigne et une TVA absentes", () => {
    // Tous les clients ne sont pas assujettis, et beaucoup n'ont pas de nom
    // commercial distinct : les exiger bloquerait des déclarations légitimes.
    const company = Company.declare({ ...identity, enseigne: "", tvaIntracom: "" }, contact);

    expect(company.enseigne).toBe("");
    expect(company.tvaIntracom).toBe("");
  });

  it("retombe sur la raison sociale quand il n'y a pas d'enseigne", () => {
    expect(Company.declare({ ...identity, enseigne: "" }, contact).displayName()).toBe(
      "Boulangerie du Marais SAS",
    );
    expect(Company.declare(identity, contact).displayName()).toBe("Le Pain Quotidien du Marais");
  });

  it("reprend le contact fourni sans le redemander", () => {
    // Le créateur EST l'interlocuteur : lui redemander son nom juste après son
    // profil serait de la double saisie.
    expect(Company.declare(identity, contact).contact.email.value).toBe("camille@pqmarais.fr");
  });
});
