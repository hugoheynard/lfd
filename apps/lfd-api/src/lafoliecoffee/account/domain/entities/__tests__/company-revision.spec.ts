import { CompanyChangedSinceReadError } from "../../errors/account-errors.js";
import { Company } from "../company.js";

/** Une société relue à une révision donnée — le reste n'entre pas en jeu. */
function companyAt(revision?: number): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Marais Café",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    ...(revision === undefined ? {} : { revision }),
  });
}

describe("Company — la révision de la fiche", () => {
  it("porte la révision relue", () => {
    expect(companyAt(7).revision).toBe(7);
  });

  it("une société relue sans révision est à la révision 0", () => {
    expect(companyAt().revision).toBe(0);
  });

  it("une société déclarée naît à la révision 0", () => {
    const declared = Company.declare(
      {
        raisonSociale: "",
        enseigne: "Marais Café",
        formeJuridique: "",
        siret: "",
        siren: "",
        vatNumber: "",
      },
      null,
      "staff",
    );
    expect(declared.revision).toBe(0);
  });

  it("accepte un geste décidé à la révision chargée, et la retient pour l'écriture", () => {
    const company = companyAt(4);
    company.ensureReadAt(4);
    expect(company.readAt).toBe(4);
  });

  it("n'a rien à comparer quand l'appelant n'a pas lu de fiche : l'écriture reste libre", () => {
    const company = companyAt(4);
    company.ensureReadAt(null);
    expect(company.readAt).toBeNull();
  });

  it("une fiche lue périmée ne laisse aucune révision retenue", () => {
    const company = companyAt(4);
    expect(() => company.ensureReadAt(3)).toThrow(CompanyChangedSinceReadError);
    expect(company.readAt).toBeNull();
  });

  it.each([3, 5])("refuse une fiche lue à la révision %i quand elle est à 4", (read) => {
    expect(() => companyAt(4).ensureReadAt(read)).toThrow(CompanyChangedSinceReadError);
  });

  it("le refus nomme le cas et le geste de sortie", () => {
    expect(() => companyAt(4).ensureReadAt(3)).toThrow(
      "Cette fiche a changé depuis que vous l'avez ouverte : relisez-la avant d'enregistrer.",
    );
  });
});
