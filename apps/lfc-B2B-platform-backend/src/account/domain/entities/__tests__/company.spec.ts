import {
  CompanyActivationBlockedError,
  InvalidCompanyIdentityError,
} from "../../errors/account-errors.js";
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

  it("n'exige que la raison sociale : il faut bien appeler la société par un nom", () => {
    expect(() => Company.declare({ ...identity, raisonSociale: "   " }, contact)).toThrow(
      InvalidCompanyIdentityError,
    );
  });

  it("s'ouvre SANS papiers — le commercial est chez le client, pas au greffe", () => {
    // Exiger 14 chiffres et une forme juridique au moment où l'on est devant le
    // client, c'est renvoyer le commercial dans sa voiture. Le compte se crée,
    // les papiers suivent.
    const company = Company.declare({ ...identity, formeJuridique: "", siret: "" }, contact);

    expect(company.siret).toBeNull();
    expect(company.siretDigits).toBe("");
    expect(company.hasLegalIdentity).toBe(false);
  });

  it("refuse d'ACTIVER un compte sans identité légale", () => {
    // On ouvre sans papiers ; on ne devient pas client sans. Sans SIRET, rien à
    // facturer.
    const company = Company.declare({ ...identity, formeJuridique: "", siret: "" }, contact);

    expect(() => {
      company.activate(new Date("2026-08-11T10:00:00.000Z"));
    }).toThrow(CompanyActivationBlockedError);
  });

  it("complète un trou, mais ne réécrit jamais un SIRET déjà posé", () => {
    // Changer un SIRET ferait d'une société une autre, sous la même référence
    // client et avec son historique de commandes.
    const company = Company.declare({ ...identity, formeJuridique: "", siret: "" }, contact);

    company.completeLegalIdentity({ formeJuridique: "SARL", siret: "812 456 789 00021" });
    expect(company.formeJuridique).toBe("SARL");
    expect(company.siretDigits).toBe("81245678900021");

    company.completeLegalIdentity({ formeJuridique: "SAS", siret: "" });
    expect(company.formeJuridique).toBe("SARL");
  });

  it("refuse toujours un SIRET SAISI mais faux", () => {
    // Facultatif ne veut pas dire libre : mieux vaut rien qu'un numéro qu'on
    // croirait bon.
    expect(() => Company.declare({ ...identity, siret: "11111111111111" }, contact)).toThrow();
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
