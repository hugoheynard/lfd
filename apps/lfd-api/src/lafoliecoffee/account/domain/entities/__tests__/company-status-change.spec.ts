/**
 * `statusChange` : le statut n'est écrit que s'il a bougé depuis le chargement
 * (`documentation/caching-usage/qui-est-le-client.md`, « La société ne réécrit plus son statut »).
 *
 * Régression : `save()` réécrivait `status` à chaque sauvegarde, et le
 * déclencheur `UPDATE OF status` de l'estampille vidait alors le principal
 * gardé de tout le monde à chaque correction d'identité (2026-11-05).
 */
import type { CompanyStatus } from "../../value-objects/company-status.js";
import { ContactDetails } from "../../value-objects/contact-details.js";
import { Company } from "../company.js";

const CONTACT = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "Gérante",
  email: "camille@pqmarais.fr",
  phone: "0601020304",
};
const AGENT = { staffUserId: "staff_camille", name: "Camille Rousseau", role: "commercial" };
const AT = new Date("2026-08-07T09:00:00.000Z");

function loaded(status: CompanyStatus): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Marais Café",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: ContactDetails.create(CONTACT),
    grantedTerms: [],
    requestedTerm: null,
    status,
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

describe("Company — statusChange", () => {
  it("est null sans transition, même après une écriture d'identité", () => {
    const company = loaded("active");
    company.editSoftIdentity({ enseigne: "Autre enseigne", vatNumber: "" });
    const state = company.toPersistence();
    expect(state.statusChange).toBeNull();
    expect(state.status).toBe("active");
  });

  it("porte le statut après une activation", () => {
    const company = loaded("pending");
    company.activate(AT, true, AGENT);
    expect(company.toPersistence().statusChange).toEqual({ status: "active" });
  });

  it("porte le statut après une suspension, puis une clôture", () => {
    const company = loaded("active");
    company.suspend("staff");
    expect(company.toPersistence().statusChange).toEqual({ status: "suspended" });
    company.terminate();
    expect(company.toPersistence().statusChange).toEqual({ status: "terminated" });
  });

  it("redevient null quand le statut revient à celui chargé", () => {
    const company = loaded("active");
    company.suspend("staff");
    company.reactivate();
    expect(company.toPersistence().statusChange).toBeNull();
  });

  it("est toujours présent sur une société neuve", () => {
    const company = Company.declare(
      {
        raisonSociale: "PQ Marais",
        enseigne: "Marais Café",
        formeJuridique: "SAS",
        siret: "81245678900021",
        siren: "",
        vatNumber: "",
      },
      ContactDetails.create(CONTACT),
      "self",
    );
    expect(company.toPersistence().statusChange).toEqual({ status: "pending" });
  });
});
