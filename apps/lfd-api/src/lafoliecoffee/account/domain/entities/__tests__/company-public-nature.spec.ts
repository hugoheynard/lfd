import {
  ChorusRoutingNotPublicError,
  CompanyPublicNatureFrozenError,
} from "../../errors/account-errors.js";
import type { CompanyStatus } from "../../value-objects/company-status.js";
import { Company } from "../company.js";

const ACTIVATED_AT = new Date(0);

function stored(formeJuridique: string, status: CompanyStatus): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "Commune de Lyon",
    enseigne: "École Jules Ferry",
    formeJuridique,
    siret: "81245678800023",
    siren: "812456788",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status,
    activatedAt: status === "pending" ? null : ACTIVATED_AT,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

function correction(formeJuridique: string) {
  return {
    raisonSociale: "",
    formeJuridique,
    siret: "",
    siren: "",
    enseigne: "",
    vatNumber: "",
  };
}

describe("Company — la nature publique se fige à l'activation", () => {
  it("dit qu'un compte à forme publique est public", () => {
    expect(stored("public_state", "active").isPublic).toBe(true);
    expect(stored("SAS", "active").isPublic).toBe(false);
    expect(stored("", "pending").isPublic).toBe(false);
  });

  it("laisse un compte en attente passer d'entreprise à organisme public", () => {
    const company = stored("SAS", "pending");

    company.correctIdentity(correction("public_local_authority"));

    expect(company.formeJuridique).toBe("public_local_authority");
  });

  it("refuse qu'un compte actif passe d'entreprise à organisme public, en nommant le geste", () => {
    const company = stored("SAS", "active");

    expect(() => company.correctIdentity(correction("public_state"))).toThrow(
      CompanyPublicNatureFrozenError,
    );
    expect(() => company.correctIdentity(correction("public_state"))).toThrow(
      /passer d'entreprise à organisme public\. Ouvrez un autre compte/u,
    );
    expect(company.formeJuridique).toBe("SAS");
  });

  it("refuse qu'un compte actif passe d'organisme public à entreprise", () => {
    const company = stored("public_establishment", "active");

    expect(() => company.correctIdentity(correction("sarl"))).toThrow(
      /passer d'organisme public à entreprise/u,
    );
  });

  it("refuse aussi le passage sur un compte suspendu : il a déjà été ouvert", () => {
    expect(() => stored("SAS", "suspended").correctIdentity(correction("public_state"))).toThrow(
      CompanyPublicNatureFrozenError,
    );
  });

  it("laisse corriger la forme à l'intérieur d'une même nature", () => {
    const publicCompany = stored("public_establishment", "active");
    publicCompany.correctIdentity(correction("public_health_establishment"));
    expect(publicCompany.formeJuridique).toBe("public_health_establishment");

    const privateCompany = stored("SAS", "active");
    privateCompany.correctIdentity(correction("sarl"));
    expect(privateCompany.formeJuridique).toBe("sarl");
  });

  it("laisse compléter une forme encore vide sur un compte actif", () => {
    const company = stored("", "active");

    company.completeLegalIdentity({
      raisonSociale: "",
      formeJuridique: "public_state",
      siret: "",
      siren: "",
    });

    expect(company.formeJuridique).toBe("public_state");
  });
});

describe("Company — la fiche Chorus Pro", () => {
  const READING = {
    commitmentRequired: true,
    serviceCodeRequired: false,
    defaultServiceCode: "",
    checkedOn: "2026-11-01",
  };
  const AGENT = { staffUserId: "staff_1", name: "Camille", role: "commercial" };

  it("se relève sur un organisme public", () => {
    const routing = stored("public_state", "active").recordChorusRouting(READING, AGENT);

    expect(routing.commitmentRequired).toBe(true);
  });

  it("est refusée sur une entreprise, en nommant le geste de sortie", () => {
    expect(() => stored("SAS", "pending").recordChorusRouting(READING, AGENT)).toThrow(
      ChorusRoutingNotPublicError,
    );
    expect(() => stored("SAS", "pending").recordChorusRouting(READING, AGENT)).toThrow(
      /forme juridique publique/u,
    );
  });
});
