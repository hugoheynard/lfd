import { resupplyOriginOf } from "../domain/resupply-origin.js";
import { resupplyTargetOf, type SiteResupplySnapshot } from "../domain/site-resupply.js";

/** Une journée civile en colonne `DATE` : minuit UTC, que Postgres tronque au jour. */
export function dayColumn(serviceDay: string): Date {
  return new Date(`${serviceDay}T00:00:00.000Z`);
}

/** Les lignes, dans l'ordre de saisie. */
export const SITE_RESUPPLY_LINES = {
  orderBy: { position: "asc" },
  select: { sku: true, label: true, quantity: true },
} as const;

/** La ligne telle que Prisma la rend, avec ses lignes. */
export interface SiteResupplyRow {
  readonly id: string;
  readonly siteId: string;
  readonly target: string;
  readonly serviceDay: Date;
  readonly version: number;
  readonly origin: string;
  readonly name: string | null;
  readonly placedAt: Date | null;
  readonly placedByStaffId: string | null;
  readonly placedByName: string | null;
  readonly placedByRole: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
  readonly cancelledByName: string | null;
  readonly cancelledByRole: string | null;
  readonly lines: readonly {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
  }[];
}

/**
 * Ligne → instantané du domaine. La visée et l'origine revalident ; la journée se relit en
 * UTC. Un envoi est entier en base (CHECK `site_resupply_placement_whole`) :
 * un auteur absent à côté d'un instant n'arrive pas.
 */
export function snapshotOf(row: SiteResupplyRow): SiteResupplySnapshot {
  return {
    id: row.id,
    siteId: row.siteId,
    target: resupplyTargetOf(row.target),
    serviceDay: row.serviceDay.toISOString().slice(0, 10),
    version: row.version,
    origin: resupplyOriginOf(row.origin),
    name: row.name,
    lines: row.lines,
    placed:
      row.placedAt === null
        ? null
        : {
            at: row.placedAt,
            author: {
              staffUserId: row.placedByStaffId ?? "",
              name: row.placedByName ?? "",
              role: row.placedByRole ?? "",
            },
          },
    cancelled:
      row.cancelledAt === null
        ? null
        : {
            at: row.cancelledAt,
            author: {
              staffUserId: row.cancelledByStaffId ?? "",
              name: row.cancelledByName ?? "",
              role: row.cancelledByRole ?? "",
            },
          },
  };
}
