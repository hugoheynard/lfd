import { CompanyActivationBlockedError } from "../../errors/account-errors.js";
import {
  CompanyHasSubAccountsError,
  ParentIsSubAccountError,
} from "../../errors/hierarchy-errors.js";
import { Company } from "../company.js";
import { chaletCompany, principalCompany } from "./company-hierarchy-fixtures.js";

const NOW = new Date("2030-03-01T08:00:00.000Z");
const AGENT = { staffUserId: "staff_1", name: "Camille", role: "commercial" };

describe("Company — sous-comptes (plan-sous-comptes S1)", () => {
  it("un sous-compte déclaré porte son principal, et le persiste", () => {
    const company = Company.declare(
      {
        raisonSociale: "",
        enseigne: "Chalet Edelweiss",
        formeJuridique: "",
        siret: "",
        siren: "",
        vatNumber: "",
      },
      null,
    );
    company.attachTo(principalCompany());

    expect(company.parentCompanyId).toBe("groupe");
    expect(company.toPersistence().hierarchyChange).toEqual({
      parentCompanyId: "groupe",
      groupWithoutDelivery: false,
    });
  });

  it("une société chargée dont la hiérarchie n'a pas bougé ne la réécrit pas", () => {
    const company = chaletCompany();
    company.editSoftIdentity({ enseigne: "Chalet Edelweiss II", vatNumber: "" });

    // Régression évitée : une écriture d'identité chargée avant un rattachement
    // concurrent remettait `parent_company_id` à ce qu'elle avait lu.
    expect(company.toPersistence().hierarchyChange).toBeNull();
  });

  it("refuse un principal qui a lui-même un principal", () => {
    expect(() => principalCompany().attachTo(chaletCompany())).toThrow(ParentIsSubAccountError);
  });

  it("refuse de faire sous-compte un principal qui a des sous-comptes", () => {
    const other = Company.reconstitute({
      id: "autre",
      raisonSociale: "",
      enseigne: "Autre",
      formeJuridique: "",
      siret: "",
      vatNumber: "",
      contact: null,
      grantedTerms: [],
      requestedTerm: null,
      status: "active",
      activatedAt: null,
      activatedBy: null,
      suspensionCause: null,
      nafCode: "",
    });

    expect(() => principalCompany("active", true).attachTo(other)).toThrow(
      CompanyHasSubAccountsError,
    );
  });

  describe("activer un chalet qui suit la facturation (§2.1 bis)", () => {
    it("s'active sans SIRET ni détenteur quand son principal actif porte l'identité", () => {
      const chalet = chaletCompany();

      chalet.activate(NOW, true, AGENT, principalCompany("active"));

      expect(chalet.status).toBe("active");
    });

    it("reste bloqué si le principal n'est pas actif", () => {
      expect(() => chaletCompany().activate(NOW, true, AGENT, principalCompany("pending"))).toThrow(
        CompanyActivationBlockedError,
      );
    });

    it("reste bloqué sans suivi : il n'a pas d'identité à lui", () => {
      expect(() => chaletCompany().activate(NOW, true, AGENT)).toThrow(
        CompanyActivationBlockedError,
      );
    });

    it("n'accepte pas le principal d'un autre comme porteur", () => {
      expect(() =>
        chaletCompany("autre").activate(NOW, true, AGENT, principalCompany("active")),
      ).toThrow(CompanyActivationBlockedError);
    });

    it("exige toujours un numéro joignable : la livraison en dépend", () => {
      expect(() => chaletCompany().activate(NOW, false, AGENT, principalCompany())).toThrow(
        CompanyActivationBlockedError,
      );
    });
  });
});
