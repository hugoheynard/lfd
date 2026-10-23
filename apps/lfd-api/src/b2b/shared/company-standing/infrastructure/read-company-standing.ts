import { companyDisplayName } from "@lfd/contracts";

import type { Prisma } from "../../../../platform/database/client/client.js";
import type { PrismaService } from "../../../../platform/database/prisma.service.js";
import type {
  CompanyStanding,
  StandingCompanyStatus,
  StandingPrincipal,
} from "../domain/company-standing.js";
import type { StandingRole } from "../domain/standing-role.js";
import { INHERITING_PARENT_ROLES } from "../domain/effective-role.js";
import { openingMembership } from "./opening-membership.js";

/** Le seul statut d'un principal qui ouvre ses sites. */
const ACTIVE = "active";
/** Le statut d'un site qui ferme l'héritage (R1, R6). */
const SUSPENDED = "suspended";

/**
 * La membership d'une personne au principal qui OUVRE ses sites : acceptée —
 * une invitation vivante non acceptée n'ouvre rien au-delà de sa société
 * (C1, §7.2) —, au rôle `owner` ou `admin`.
 */
function heirMembership(userId: string): Prisma.MembershipWhereInput {
  return { userId, acceptedAt: { not: null }, role: { in: [...INHERITING_PARENT_ROLES] } };
}

/**
 * **Les sites qu'une personne atteint par héritage**, en condition de requête
 * — la même règle que {@link readCompanyStanding}, pour les lectures en liste
 * (« Mes commandes » du principal, sociétés atteignables). Site non suspendu,
 * principal `active`, membership du principal acceptée `owner`/`admin`.
 */
export function inheritedSiteWhere(userId: string): Prisma.CompanyWhereInput {
  return {
    status: { not: SUSPENDED },
    parentCompany: { status: ACTIVE, memberships: { some: heirMembership(userId) } },
  };
}

/**
 * **LA requête du rôle effectif d'une personne dans une société** (plan
 * `documentation/comptes-client/plan-entrer-dans-ses-sites.md`, R1). Tout
 * lecteur de rôle du bloc commerce la lit — `lint:company-role-readers`
 * refuse les autres.
 *
 * Une lecture, deux sources :
 * - la membership **propre** qui ouvre (`openingMembership` : acceptée, ou
 *   invitation vivante) ;
 * - l'**héritage** du principal ACTUEL de la société (`parent_company_id` relu
 *   à chaque requête, R6) : membership au principal acceptée `owner`/`admin`,
 *   principal `active`, site non suspendu. Une membership de site ne donne
 *   rien sur le principal ni sur les frères (R3) : seul le parent de la
 *   société visée est lu, jamais ses enfants.
 *
 * `now` vient du `Clock` de l'appelant.
 *
 * @returns la place de la personne, ou `null` : ni propre ni héritée.
 */
export async function readCompanyStanding(
  prisma: PrismaService,
  now: Date,
  userId: string,
  companyId: string,
): Promise<CompanyStanding | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      status: true,
      memberships: {
        where: { userId, ...openingMembership(now) },
        select: { role: true, acceptedAt: true },
      },
      parentCompany: {
        select: {
          id: true,
          status: true,
          enseigne: true,
          raisonSociale: true,
          memberships: { where: heirMembership(userId), select: { role: true } },
        },
      },
    },
  });
  return company === null ? null : standingFromRow(company);
}

/** La ligne que {@link readCompanyStanding} lit, réduite à ce que la règle décide. */
export interface StandingRow {
  readonly status: StandingCompanyStatus;
  readonly memberships: readonly {
    readonly role: StandingRole;
    readonly acceptedAt: Date | null;
  }[];
  readonly parentCompany: {
    readonly id: string;
    readonly status: StandingCompanyStatus;
    readonly enseigne: string;
    readonly raisonSociale: string;
    /** Déjà filtrées par {@link heirMembership} : acceptées, `owner`/`admin`. */
    readonly memberships: readonly { readonly role: StandingRole }[];
  } | null;
}

/**
 * La règle sur la ligne lue, pure — éprouvée branche par branche sans base.
 * L'héritage exige un principal `active` et un site non suspendu (R1) ; une
 * membership propre ne dépend ni de l'un ni de l'autre.
 */
export function standingFromRow(row: StandingRow): CompanyStanding | null {
  const ownRow = row.memberships[0];
  const own = ownRow?.role ?? null;
  const parent = row.parentCompany;
  const parentRole = parent?.memberships[0]?.role;
  // Le filtre est déjà dans la requête ; la règle le redit : une ligne mal
  // filtrée n'ouvre pas un site à un `orders` du principal.
  const via: StandingPrincipal | null =
    parent !== null &&
    parentRole !== undefined &&
    INHERITING_PARENT_ROLES.includes(parentRole) &&
    parent.status === ACTIVE &&
    row.status !== SUSPENDED
      ? { companyId: parent.id, name: companyDisplayName(parent), role: parentRole }
      : null;
  if (own === null && via === null) {
    return null;
  }
  return {
    companyStatus: row.status,
    own,
    ownAccepted: ownRow !== undefined && ownRow.acceptedAt !== null,
    via,
  };
}

/** Un site atteint par héritage seulement, tel que le sélecteur le liste. */
export interface ReachableSite {
  readonly companyId: string;
  readonly name: string;
  readonly via: StandingPrincipal;
}

/**
 * Les sites qu'une personne atteint **par héritage seul** — ceux où elle a
 * déjà une membership qui ouvre sont ses sociétés propres, listées comme
 * telles (R5). Ordonnés par principal puis par nom : un ordre stable.
 */
export async function readReachableSites(
  prisma: PrismaService,
  now: Date,
  userId: string,
): Promise<readonly ReachableSite[]> {
  const rows = await prisma.company.findMany({
    where: {
      ...inheritedSiteWhere(userId),
      memberships: { none: { userId, ...openingMembership(now) } },
    },
    select: {
      id: true,
      enseigne: true,
      raisonSociale: true,
      parentCompany: {
        select: {
          id: true,
          enseigne: true,
          raisonSociale: true,
          memberships: { where: heirMembership(userId), select: { role: true } },
        },
      },
    },
    orderBy: [{ parentCompanyId: "asc" }, { enseigne: "asc" }, { id: "asc" }],
  });
  return rows.flatMap((row) => {
    const parent = row.parentCompany;
    const role = parent?.memberships[0]?.role;
    if (parent === null || role === undefined || !INHERITING_PARENT_ROLES.includes(role)) {
      return [];
    }
    return [
      {
        companyId: row.id,
        name: companyDisplayName(row),
        via: { companyId: parent.id, name: companyDisplayName(parent), role },
      },
    ];
  });
}
