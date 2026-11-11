import {
  InvalidLegalFormError,
  InvalidVatNumberError,
  VatNumberFrozenError,
  VatSirenMismatchError,
} from "../../errors/account-errors.js";
import type { CompanyStatus } from "../../value-objects/company-status.js";
import { ContactDetails } from "../../value-objects/contact-details.js";
import { Company } from "../company.js";

/** Un SIRET dont le SIREN (732 829 320) est valide, et le numéro de TVA de ce SIREN. */
const SIRET = "73282932000009";
const VAT = "FR44732829320";
/** Le numéro d'une autre entreprise (SIREN 812 456 789). */
const OTHER_VAT = "FR66812456789";

function companyIn(status: CompanyStatus, vatNumber = ""): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Marais Café",
    formeJuridique: "SAS",
    siret: SIRET,
    vatNumber,
    contact: ContactDetails.create({
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "",
      email: "camille@pqmarais.fr",
      phone: "",
    }),
    grantedTerms: [],
    requestedTerm: null,
    status,
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

const DECLARATION = {
  raisonSociale: "",
  enseigne: "Marais Café",
  formeJuridique: "",
  siret: "",
  siren: "",
  vatNumber: "",
};

describe("la TVA d'une société", () => {
  it("refuse un numéro au format faux", () => {
    expect(() => companyIn("pending").editSoftIdentity({ enseigne: "", vatNumber: "abc" })).toThrow(
      InvalidVatNumberError,
    );
  });

  it("refuse le numéro d'une autre entreprise que celle du SIRET", () => {
    expect(() =>
      companyIn("pending").editSoftIdentity({ enseigne: "", vatNumber: OTHER_VAT }),
    ).toThrow(VatSirenMismatchError);
  });

  it("à la déclaration, compare le numéro au SIRET déclaré avec lui", () => {
    expect(() =>
      Company.declare({ ...DECLARATION, siret: SIRET, vatNumber: OTHER_VAT }, null, "staff"),
    ).toThrow(VatSirenMismatchError);
  });

  it("le membre la saisit tant que la société est en attente", () => {
    const company = companyIn("pending");
    company.editSoftIdentityAsMember({ enseigne: "Marais Café", vatNumber: VAT });
    expect(company.vatNumber).toBe(VAT);
  });

  it.each<CompanyStatus>(["active", "suspended"])(
    "le membre ne la change plus une fois la société %s",
    (status) => {
      const company = companyIn(status, VAT);
      expect(() =>
        company.editSoftIdentityAsMember({ enseigne: "Marais Café", vatNumber: "" }),
      ).toThrow(VatNumberFrozenError);
    },
  );

  it("le membre renvoie le même numéro, écrit autrement, sans être refusé", () => {
    const company = companyIn("active", VAT);
    company.editSoftIdentityAsMember({
      enseigne: "Nouvelle enseigne",
      vatNumber: " fr44 732 829 320 ",
    });
    expect(company.enseigne).toBe("Nouvelle enseigne");
  });

  it("une TVA d'avant le contrôle, renvoyée telle quelle, ne bloque pas l'enseigne", () => {
    const company = companyIn("active", "fr 44 732 829 32");
    company.editSoftIdentityAsMember({ enseigne: "Nouvelle", vatNumber: "fr 44 732 829 32" });
    expect(company.enseigne).toBe("Nouvelle");
    expect(company.vatNumber).toBe("fr 44 732 829 32");
  });

  it("une TVA déjà saisie est comparée au SIRET qui arrive ensuite", () => {
    const company = Company.declare({ ...DECLARATION, vatNumber: OTHER_VAT }, null, "self");
    company.completeLegalIdentity({
      raisonSociale: "",
      formeJuridique: "",
      siret: SIRET,
      siren: "",
    });
    expect(() =>
      company.editSoftIdentityAsMember({ enseigne: "Marais Café", vatNumber: OTHER_VAT }),
    ).toThrow(VatSirenMismatchError);
  });

  it("le back-office la corrige après l'activation", () => {
    const company = companyIn("active", "");
    company.editSoftIdentity({ enseigne: "Marais Café", vatNumber: VAT });
    expect(company.vatNumber).toBe(VAT);
  });
});

describe("la forme juridique d'une société", () => {
  it("refuse une forme hors de la liste", () => {
    expect(() =>
      Company.declare({ ...DECLARATION, formeJuridique: "Entreprise géniale" }, null, "staff"),
    ).toThrow(InvalidLegalFormError);
  });

  it("accepte une forme reconnue, écrite comme avant la liste fermée", () => {
    const company = Company.declare({ ...DECLARATION, formeJuridique: "S.A.S." }, null, "staff");
    expect(company.formeJuridique).toBe("S.A.S.");
  });

  it("refuse une forme inconnue à la correction du back-office", () => {
    expect(() =>
      companyIn("active").correctLegalIdentity({
        raisonSociale: "",
        formeJuridique: "Truc",
        siret: "",
        siren: "",
      }),
    ).toThrow(InvalidLegalFormError);
  });
});
