import type { Prisma } from "../../../platform/database/client/client.js";
import { inheritedSiteWhere } from "../../shared/company-standing/infrastructure/read-company-standing.js";

/** Le demandeur et la société dont il lit les commandes. */
export interface CompanyOrderWallScope {
  readonly actorUserId: string;
  readonly companyId: string;
}

/**
 * Le mur de « Mes commandes » (`plan-commandes-des-sites.md`, §7.5) : la
 * société, et ses sites ACTUELS quand le demandeur en hérite — la condition
 * de la requête partagée (`inheritedSiteWhere`, S6, R1), jamais recopiée. Partagé
 * par la liste et le récapitulatif (`plan-recapitulatif-des-commandes.md`,
 * §2) : deux copies du mur finiraient par diverger.
 */
export function companyOrderWallOf(scope: CompanyOrderWallScope): Prisma.OrderWhereInput {
  return {
    OR: [
      { companyId: scope.companyId },
      {
        company: { parentCompanyId: scope.companyId, ...inheritedSiteWhere(scope.actorUserId) },
      },
    ],
  };
}
