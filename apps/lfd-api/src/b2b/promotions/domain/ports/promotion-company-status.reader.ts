import type { StandingCompanyStatus } from "../../../shared/company-standing/domain/company-standing.js";

/**
 * **Le statut d'une société, relu en base** — le fait dont dépendent les
 * publics « pros », « particuliers », « tous sauf les pros actifs ». Lu
 * seulement quand une promotion le demande : la plupart des questions n'en
 * ont pas besoin.
 */
export abstract class PromotionCompanyStatusReader {
  /** `null` si la société n'existe pas. */
  abstract companyStatusOf(companyId: string): Promise<StandingCompanyStatus | null>;
}
