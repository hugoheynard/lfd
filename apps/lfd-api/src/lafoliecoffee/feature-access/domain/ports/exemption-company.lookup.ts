import type { ExemptionCompanyFacts } from "../feature-company-exemption.js";

/**
 * Port de **lecture** : la société qu'un ajout désigne, telle que la
 * factory de l'exemption la juge. Une lecture par identifiant.
 */
export abstract class ExemptionCompanyLookup {
  /** La société, archivée ou non ; `null` si l'identifiant n'en désigne aucune. */
  abstract describe(companyId: string): Promise<ExemptionCompanyFacts | null>;
}
