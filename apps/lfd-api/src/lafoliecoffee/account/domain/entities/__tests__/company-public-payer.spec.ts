import type { DeferredTerm } from "@lfd/contracts";

import {
  PublicPayerDirectDebitBlockRefusedError,
  PublicPayerTermsRequiredError,
} from "../../errors/public-payer-errors.js";
import { ContactDetails } from "../../value-objects/contact-details.js";
import { DirectDebitBlock } from "../../value-objects/direct-debit-block.js";
import type { CompanyStatus } from "../../value-objects/company-status.js";
import { Company } from "../company.js";

// Instants relus tels quels, jamais comparés à l'horloge.
const ACTIVATED_AT = new Date(0);
const AGENT = { staffUserId: "staff_1", name: "Agent", role: "admin" };

function company(input: {
  readonly formeJuridique: string;
  readonly status?: CompanyStatus;
  readonly grantedTerms?: readonly DeferredTerm[];
  readonly directDebitBlock?: DirectDebitBlock | null;
}): Company {
  const status = input.status ?? "pending";
  return Company.reconstitute({
    id: "c_public",
    raisonSociale: "Commune de Chamonix",
    enseigne: "École du Mont-Blanc",
    formeJuridique: input.formeJuridique,
    siret: "81245678800023",
    siren: "812456788",
    vatNumber: "",
    contact: ContactDetails.create({
      firstName: "Claire",
      lastName: "Durand",
      fonction: "Intendante",
      email: "intendance@ecole.fr",
      phone: "04 50 00 00 00",
    }),
    grantedTerms: input.grantedTerms ?? [],
    requestedTerm: null,
    status,
    activatedAt: status === "pending" ? null : ACTIVATED_AT,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    directDebitBlock: input.directDebitBlock ?? null,
  });
}

describe("Company — un organisme public règle au compte (P1b, B1)", () => {
  it("l'activation d'un organisme public lui accorde le compte", () => {
    const school = company({ formeJuridique: "public_establishment" });

    school.activate(ACTIVATED_AT, true, AGENT);

    expect(school.grantedTerms).toEqual(["monthly"]);
    expect(school.settlesOnAccount()).toBe(true);
  });

  it("l'activation fait tomber un blocage posé pendant l'attente", () => {
    const school = company({
      formeJuridique: "public_state",
      grantedTerms: ["monthly"],
      directDebitBlock: DirectDebitBlock.reconstitute(ACTIVATED_AT, "staff_1", "Essai"),
    });

    school.activate(ACTIVATED_AT, true, AGENT);

    expect(school.directDebitBlock).toBeNull();
    expect(school.settlesOnAccount()).toBe(true);
  });

  it("l'activation d'une entreprise n'accorde rien : le crédit reste au staff", () => {
    const shop = company({ formeJuridique: "sas" });

    shop.activate(ACTIVATED_AT, true, AGENT);

    expect(shop.grantedTerms).toEqual([]);
  });

  it("refuse de retirer le compte d'un organisme public, en nommant pourquoi", () => {
    const school = company({
      formeJuridique: "public_local_authority",
      status: "active",
      grantedTerms: ["monthly"],
    });

    expect(() => school.grantTerms([])).toThrow(PublicPayerTermsRequiredError);
    expect(() => school.grantTerms([])).toThrow(/organisme public.*au compte, par virement/u);
    expect(school.grantedTerms).toEqual(["monthly"]);
  });

  it("laisse une entreprise perdre son crédit", () => {
    const shop = company({ formeJuridique: "sas", status: "active", grantedTerms: ["monthly"] });

    expect(shop.grantTerms([])).toBe(true);
    expect(shop.grantedTerms).toEqual([]);
  });

  it("refuse de bloquer le prélèvement d'un organisme public", () => {
    const school = company({
      formeJuridique: "public_health_establishment",
      status: "active",
      grantedTerms: ["monthly"],
    });

    expect(() => school.blockDirectDebit("Impayé", ACTIVATED_AT, "staff_1")).toThrow(
      PublicPayerDirectDebitBlockRefusedError,
    );
    expect(school.directDebitBlock).toBeNull();
  });
});
