import type { Prisma } from "../../../../platform/database/client/client.js";
import { CLOSING_STATUS } from "../domain/company-closure.js";

/**
 * **Une société OUVERTE**, en condition de requête — la négation exacte de
 * `isCompanyClosed` : ni supprimée (`archived_at IS NULL`), ni résiliée.
 *
 * Tout lecteur qui décide d'un accès à une société par une requête la porte
 * dans son `where` (le principal, l'acceptation d'une invitation,
 * `inheritedSiteWhere`). Dans `lafoliecoffee/shared/` pour la même raison
 * qu'`openingMembership` : la règle vaut pour tout le bloc.
 */
export function openCompanyWhere(): Prisma.CompanyWhereInput {
  return { archivedAt: null, status: { not: CLOSING_STATUS } };
}
