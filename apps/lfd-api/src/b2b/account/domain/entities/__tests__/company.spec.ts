import {
  CompanyActivationBlockedError,
  CompanyAlreadyHasOwnerError,
  CompanyHasNoHolderError,
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
  vatNumber: "FR32812456789",
};

const AGENT = { sub: "auth0|staff", name: "Camille Rousseau", role: "commercial" };

describe("Company.declare", () => {
  it("normalise les textes et le SIRET", () => {
    const company = Company.declare(
      { ...identity, raisonSociale: "  Boulangerie   du Marais SAS " },
      contact,
    );

    expect(company.raisonSociale).toBe("Boulangerie du Marais SAS");
    expect(company.siret!.value).toBe("81245678900021");
  });

  it("n'exige que l'ENSEIGNE — le nom d'usage, pas celui du greffe", () => {
    // C'est le nom que le commercial a en tête et que le client donne au
    // téléphone. La raison sociale est une donnée d'identification officielle :
    // elle arrive avec le SIRET.
    expect(() => Company.declare({ ...identity, enseigne: "   " }, contact)).toThrow(
      InvalidCompanyIdentityError,
    );
    expect(Company.declare({ ...identity, raisonSociale: "" }, contact).raisonSociale).toBe("");
  });

  it("s'ouvre SANS papiers — le commercial est chez le client, pas au greffe", () => {
    // Exiger 14 chiffres et une forme juridique au moment où l'on est devant le
    // client, c'est renvoyer le commercial dans sa voiture. Le compte se crée,
    // les papiers suivent.
    const company = Company.declare(
      { ...identity, raisonSociale: "", formeJuridique: "", siret: "" },
      contact,
    );

    expect(company.siret).toBeNull();
    expect(company.siretDigits).toBe("");
    expect(company.hasLegalIdentity).toBe(false);
  });

  it("refuse d'ACTIVER un compte sans identité légale", () => {
    // On ouvre sans papiers ; on ne devient pas client sans. Sans SIRET, rien à
    // facturer.
    const company = Company.declare(
      { ...identity, raisonSociale: "", formeJuridique: "", siret: "" },
      contact,
    );

    expect(() => {
      company.activate(new Date("2026-08-11T10:00:00.000Z"), true, AGENT);
    }).toThrow(CompanyActivationBlockedError);
  });

  it("complète un trou, mais ne réécrit jamais un SIRET déjà posé", () => {
    // Changer un SIRET ferait d'une société une autre, sous la même référence
    // client et avec son historique de commandes.
    const company = Company.declare(
      { ...identity, raisonSociale: "", formeJuridique: "", siret: "" },
      contact,
    );

    company.completeLegalIdentity({
      raisonSociale: "Boulangerie du Marais SAS",
      formeJuridique: "SARL",
      siret: "812 456 789 00021",
    });
    expect(company.raisonSociale).toBe("Boulangerie du Marais SAS");
    expect(company.formeJuridique).toBe("SARL");
    expect(company.siretDigits).toBe("81245678900021");

    company.completeLegalIdentity({ raisonSociale: "Autre SAS", formeJuridique: "SAS", siret: "" });
    expect(company.raisonSociale).toBe("Boulangerie du Marais SAS");
    expect(company.formeJuridique).toBe("SARL");
  });

  it("CORRIGE ce que compléter refusait de toucher", () => {
    // L'opération que `completeLegalIdentity` annonçait sans la fournir : au
    // comptoir, une faute de frappe restait gravée sans recours.
    const company = Company.declare({ ...identity, formeJuridique: "SARL" }, contact);

    company.correctLegalIdentity({ raisonSociale: "", formeJuridique: "SAS", siret: "" });

    expect(company.formeJuridique).toBe("SAS");
    // Un champ vide ne réécrit rien : corriger la forme n'efface pas le reste.
    expect(company.raisonSociale).toBe(identity.raisonSociale);
    expect(company.siretDigits).toBe("81245678900021");
  });

  it("refuse toujours un SIRET SAISI mais faux", () => {
    // Facultatif ne veut pas dire libre : mieux vaut rien qu'un numéro qu'on
    // croirait bon.
    expect(() => Company.declare({ ...identity, siret: "11111111111111" }, contact)).toThrow();
  });

  it("accepte une TVA absente", () => {
    // Tous les clients ne sont pas assujettis : l'exiger bloquerait des
    // déclarations parfaitement légitimes.
    const company = Company.declare({ ...identity, vatNumber: "" }, contact);

    expect(company.vatNumber).toBe("");
  });

  it("retombe sur la raison sociale d'une société déjà en base sans enseigne", () => {
    // `reconstitute` ne revalide pas : les sociétés déclarées avant que
    // l'enseigne devienne le nom exigé n'en ont pas forcément une.
    const legacy = Company.reconstitute({
      id: "cmp_1",
      raisonSociale: "Boulangerie du Marais SAS",
      enseigne: "",
      formeJuridique: "SAS",
      siret: "812 456 789 00021",
      vatNumber: "",
      contact,
      grantedTerms: [],
      requestedTerm: null,
      status: "pending",
      activatedAt: null,
      activatedBy: null,
      suspensionCause: null,
      nafCode: "",
    });

    expect(legacy.displayName()).toBe("Boulangerie du Marais SAS");
    expect(Company.declare(identity, contact).displayName()).toBe("Le Pain Quotidien du Marais");
  });

  it("reprend le contact fourni sans le redemander", () => {
    // Le créateur EST l'interlocuteur : lui redemander son nom juste après son
    // profil serait de la double saisie.
    expect(Company.declare(identity, contact).contact?.email.value).toBe("camille@pqmarais.fr");
  });

  it("s'ouvre SANS détenteur — et le dit `null`, pas « quelqu'un sans nom »", () => {
    // Au téléphone, le commercial n'a souvent que l'enseigne. Un contact aux
    // champs vides ferait passer « on ne sait pas encore » pour une personne
    // réelle, et l'activation ne saurait plus les distinguer.
    expect(Company.declare(identity, null).contact).toBeNull();
  });
});

describe("Company.attachHolder", () => {
  it("comble la place laissée vide à l'ouverture", () => {
    const company = Company.declare(identity, null);

    company.attachHolder(contact);

    expect(company.contact?.email.value).toBe("camille@pqmarais.fr");
  });

  it("REFUSE d'écraser un détenteur en place", () => {
    // En changer est une autre décision : un second détenteur ne doit pas
    // naître d'un rattachement de rattrapage.
    const company = Company.declare(identity, contact);

    expect(() => company.attachHolder(contact)).toThrow(CompanyAlreadyHasOwnerError);
  });

  it("REFUSE de créer un détenteur par « modification »", () => {
    // Corriger des coordonnées et DÉSIGNER la personne du compte ne sont pas le
    // même acte : le second ouvre un accès, celui-ci ne le fait pas. Sans ce
    // refus, « modifier le détenteur » posait un nom en fiche sans donner la clé
    // de l'espace — un détenteur affiché, incapable d'entrer.
    const company = Company.declare(identity, null);

    expect(() => company.changePrimaryContact(contact)).toThrow(CompanyHasNoHolderError);
  });

  it("bloque l'activation tant que personne n'est rattaché", () => {
    // Le compte serait actif et sa porte murée : le client découvrirait au
    // premier besoin qu'on lui a ouvert un espace sans lui donner la clé.
    const company = Company.declare(identity, null);

    expect(() => company.activate(new Date("2026-08-12T10:00:00.000Z"), true, AGENT)).toThrow(
      CompanyActivationBlockedError,
    );
  });
});
