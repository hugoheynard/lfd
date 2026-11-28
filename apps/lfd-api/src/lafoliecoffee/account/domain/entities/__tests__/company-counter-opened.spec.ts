/**
 * Le compte ouvert au comptoir (`plan-comptes-du-comptoir.md`, § 3.1) : un
 * nom d'usage et un contact joignable suffisent ; il se convertit en
 * `pending` ou s'active, se résilie, et n'admet aucun membre avant.
 */
import {
  CompanyActivationBlockedError,
  CompanyStatusTransitionError,
  InvalidCompanyIdentityError,
  InvalidOpeningAuthorError,
} from "../../errors/account-errors.js";
import {
  CounterAccountConversionBlockedError,
  CounterAccountHasNoMembersError,
  CounterAccountUnreachableError,
} from "../../errors/counter-account-errors.js";
import { CompanyOpening } from "../../value-objects/company-opening.js";
import type { CompanyStatus } from "../../value-objects/company-status.js";
import { ContactDetails } from "../../value-objects/contact-details.js";
import { Company } from "../company.js";

const CONTACT = ContactDetails.create({
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "Gérante",
  email: "camille@pqmarais.fr",
  phone: "0601020304",
});
const AGENT = { staffUserId: "staff_camille", name: "Camille Rousseau" };
const TRACE = { staffUserId: "staff_camille", name: "Camille Rousseau", role: "commercial" };
// Comparée à rien d'autre qu'elle-même : l'activation la recopie.
const AT = new Date("2026-08-07T09:00:00.000Z");

function opened(): Company {
  return Company.openAtCounter("Marais Café", CONTACT, CompanyOpening.openedBy(AGENT));
}

function loaded(status: CompanyStatus, siret = "81245678900021"): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: siret === "" ? "" : "PQ Marais",
    enseigne: "Marais Café",
    formeJuridique: siret === "" ? "" : "SAS",
    siret,
    vatNumber: "",
    contact: CONTACT,
    grantedTerms: [],
    requestedTerm: null,
    status,
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

describe("Company.openAtCounter", () => {
  it("ouvre un compte `counter_opened` sans identité légale, ouvert par l'équipe", () => {
    const company = opened();
    expect(company.status).toBe("counter_opened");
    expect(company.hasLegalIdentity).toBe(false);
    expect(company.declaredVia).toBe("staff");
    expect(company.toPersistence().statusChange).toEqual({ status: "counter_opened" });
  });

  it("exige un nom d'usage", () => {
    expect(() => Company.openAtCounter("  ", CONTACT, CompanyOpening.openedBy(AGENT))).toThrow(
      InvalidCompanyIdentityError,
    );
  });

  it("exige un contact joignable", () => {
    const silent = ContactDetails.create({
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "",
      email: "camille@pqmarais.fr",
      phone: "",
    });
    expect(() =>
      Company.openAtCounter("Marais Café", silent, CompanyOpening.openedBy(AGENT)),
    ).toThrow(CounterAccountUnreachableError);
  });

  it("exige un auteur", () => {
    expect(() => Company.openAtCounter("Marais Café", CONTACT, CompanyOpening.none())).toThrow(
      InvalidOpeningAuthorError,
    );
  });
});

describe("Company — conversion d'un compte du comptoir", () => {
  it("passe en attente quand l'identité légale et l'adresse de facturation sont là", () => {
    const company = loaded("counter_opened");
    company.convertFromCounter(true);
    expect(company.status).toBe("pending");
  });

  it("refuse sans adresse de facturation, et nomme la pièce", () => {
    const company = loaded("counter_opened");
    expect(() => company.convertFromCounter(false)).toThrow(CounterAccountConversionBlockedError);
    expect(company.status).toBe("counter_opened");
  });

  it("refuse sans identité légale", () => {
    let refusal: unknown = null;
    try {
      loaded("counter_opened", "").convertFromCounter(true);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(CounterAccountConversionBlockedError);
    expect(refusal).toMatchObject({ missing: ["identite_legale"] });
  });

  it.each<CompanyStatus>(["pending", "active", "suspended", "terminated"])(
    "refuse de convertir un compte %s",
    (status) => {
      expect(() => loaded(status).convertFromCounter(true)).toThrow(CompanyStatusTransitionError);
    },
  );

  it("s'active directement quand le verdict est vert", () => {
    const company = loaded("counter_opened");
    company.activate(AT, true, TRACE);
    expect(company.status).toBe("active");
  });

  it("ne s'active pas sans identité légale", () => {
    expect(() => loaded("counter_opened", "").activate(AT, true, TRACE)).toThrow(
      CompanyActivationBlockedError,
    );
  });

  it("se résilie", () => {
    const company = loaded("counter_opened");
    company.terminate();
    expect(company.status).toBe("terminated");
  });

  it("ne se suspend pas : il n'a jamais été actif", () => {
    expect(() => loaded("counter_opened").suspend("staff")).toThrow(CompanyStatusTransitionError);
  });

  it("refuse toujours la résiliation d'un compte en attente", () => {
    expect(() => loaded("pending").terminate()).toThrow(CompanyStatusTransitionError);
  });
});

describe("Company — aucun membre sur un compte du comptoir", () => {
  it("refuse d'ouvrir un accès", () => {
    expect(() => loaded("counter_opened").ensureAdmitsMembers()).toThrow(
      CounterAccountHasNoMembersError,
    );
  });

  it.each<CompanyStatus>(["pending", "active"])("admet un membre sur un compte %s", (status) => {
    expect(() => loaded(status).ensureAdmitsMembers()).not.toThrow();
  });

  it("refuse de rattacher un détenteur", () => {
    const company = Company.reconstitute({ ...baseWithoutHolder(), status: "counter_opened" });
    expect(() => company.attachHolder(CONTACT)).toThrow(CounterAccountHasNoMembersError);
  });
});

function baseWithoutHolder(): Parameters<typeof Company.reconstitute>[0] {
  return {
    id: "c2",
    raisonSociale: "",
    enseigne: "Marais Café",
    formeJuridique: "",
    siret: "",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "counter_opened",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  };
}
