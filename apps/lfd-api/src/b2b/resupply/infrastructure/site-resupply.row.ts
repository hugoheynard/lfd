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
  readonly placedAt: Date;
  readonly placedByStaffId: string;
  readonly placedByName: string;
  readonly placedByRole: string;
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

/** Ligne → instantané du domaine. La visée revalide ; la journée se relit en UTC. */
export function snapshotOf(row: SiteResupplyRow): SiteResupplySnapshot {
  return {
    id: row.id,
    siteId: row.siteId,
    target: resupplyTargetOf(row.target),
    serviceDay: row.serviceDay.toISOString().slice(0, 10),
    version: row.version,
    lines: row.lines,
    placed: {
      at: row.placedAt,
      author: { staffUserId: row.placedByStaffId, name: row.placedByName, role: row.placedByRole },
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
