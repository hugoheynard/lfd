import { Company } from "../company.js";
import type { CompanyStatus } from "../../value-objects/company-status.js";
import { ContactDetails } from "../../value-objects/contact-details.js";
import { HierarchyPlace } from "../../value-objects/hierarchy-place.js";

/**
 * Les sociétés des cas réels du plan (plan-sous-comptes §2.1) : un gestionnaire
 * de chalets, et un chalet sans SIRET ni détenteur propre.
 */
export function principalCompany(
  status: CompanyStatus = "active",
  hasSubAccounts = false,
): Company {
  return Company.reconstitute({
    id: "groupe",
    raisonSociale: "Alpes Chalets SAS",
    enseigne: "Alpes Chalets",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "FR12812456789",
    contact: ContactDetails.create({
      firstName: "Lise",
      lastName: "Martin",
      fonction: "Gérante",
      email: "lise@alpes-chalets.fr",
      phone: "06 11 22 33 44",
    }),
    grantedTerms: [],
    requestedTerm: null,
    status,
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    hierarchy: HierarchyPlace.reconstitute({
      parentCompanyId: null,
      hasSubAccounts,
      groupWithoutDelivery: false,
    }),
  });
}

/** Un chalet : enseigne seule, aucun papier, aucun détenteur. */
export function chaletCompany(parentCompanyId: string | null = "groupe"): Company {
  return Company.reconstitute({
    id: "chalet",
    raisonSociale: "",
    enseigne: "Chalet Edelweiss",
    formeJuridique: "",
    siret: "",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    hierarchy: HierarchyPlace.reconstitute({
      parentCompanyId,
      hasSubAccounts: false,
      groupWithoutDelivery: false,
    }),
  });
}
