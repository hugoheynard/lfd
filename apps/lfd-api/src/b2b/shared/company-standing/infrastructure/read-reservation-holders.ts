import type { PrismaService } from "../../../../platform/database/prisma.service.js";
import type { StandingCompanyStatus } from "../domain/company-standing.js";
import type { ReservationHolders } from "../domain/reservation-holders.js";

/** Le seul statut d'un principal qui ouvre ses sites — comme `inheritedSiteWhere` (Q8). */
const ACTIVE = "active";

/** Le principal d'un site, tel que la fiche client le nomme. */
export interface SitePrincipal {
  readonly id: string;
  readonly status: StandingCompanyStatus;
  readonly enseigne: string;
  readonly raisonSociale: string;
}

/**
 * **Le principal ACTUEL d'une société** (`parent_company_id`, relu à chaque
 * appel) — la relation site → principal que la réservation d'un article lit
 * (`plan-articles-sur-mesure.md`, § 2, § 5), écrite ici une fois.
 *
 * Deux lecteurs : {@link readReservationHolders} (le mur du catalogue), et la
 * fiche client « Articles réservés », qui montre aussi un principal non
 * actif pour dire pourquoi l'héritage est fermé.
 *
 * @returns `null` si la société est inconnue ; `principal: null` sans principal.
 */
export async function readSitePrincipal(
  prisma: PrismaService,
  companyId: string,
): Promise<{ readonly principal: SitePrincipal | null } | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      parentCompany: {
        select: { id: true, status: true, enseigne: true, raisonSociale: true },
      },
    },
  });
  return company === null ? null : { principal: company.parentCompany };
}

/**
 * **Pour qui un article réservé s'ouvre, vu de cette société** — elle, et son
 * principal s'il est `active` (S1, Q3, Q8). UNE lecture, par la même relation
 * que {@link readSitePrincipal}.
 *
 * Une société inconnue n'a pas de principal : elle n'ouvre que ce qui lui est
 * réservé à elle-même, c'est-à-dire rien.
 */
export async function readReservationHolders(
  prisma: PrismaService,
  companyId: string,
): Promise<ReservationHolders> {
  const read = await readSitePrincipal(prisma, companyId);
  return reservationHoldersOf(companyId, read?.principal ?? null);
}

/** La règle sur la ligne lue, pure : le principal n'ouvre que s'il est `active`. */
export function reservationHoldersOf(
  companyId: string,
  principal: Pick<SitePrincipal, "id" | "status"> | null,
): ReservationHolders {
  return {
    companyId,
    activePrincipalId: principal !== null && principal.status === ACTIVE ? principal.id : null,
  };
}
