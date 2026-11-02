import { serviceDayOfColumn } from "./day-column.js";
import { resupplySaleUnitOf } from "../domain/resupply-sale-unit.js";
import { resupplyOriginOf } from "../domain/resupply-origin.js";
import { resupplyTargetOf, type SiteResupplySnapshot } from "../domain/site-resupply.js";

/** Les lignes, dans l'ordre de saisie. */
export const SITE_RESUPPLY_LINES = {
  orderBy: { position: "asc" },
  select: { sku: true, label: true, quantity: true, saleUnit: true },
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
  readonly arrivedAt: Date | null;
  readonly arrivedByStaffId: string | null;
  readonly arrivedByName: string | null;
  readonly arrivedByRole: string | null;
  readonly launchedAt: Date | null;
  readonly launchedByName: string | null;
  readonly departedAt: Date | null;
  readonly departedByName: string | null;
  readonly lines: readonly {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
    readonly saleUnit: string;
  }[];
}

/**
 * Ligne → instantané du domaine. La visée et l'origine revalident ; la journée se relit en
 * UTC. Un envoi, comme une arrivée, est entier en base (CHECK `site_resupply_placement_whole`,
 * `…_arrival_whole`) : un auteur absent à côté d'un instant n'arrive pas.
 */
export function snapshotOf(row: SiteResupplyRow): SiteResupplySnapshot {
  return {
    id: row.id,
    siteId: row.siteId,
    target: resupplyTargetOf(row.target),
    serviceDay: serviceDayOfColumn(row.serviceDay),
    version: row.version,
    origin: resupplyOriginOf(row.origin),
    name: row.name,
    lines: row.lines.map((line) => ({
      sku: line.sku,
      label: line.label,
      quantity: line.quantity,
      saleUnit: resupplySaleUnitOf(line.sku, line.saleUnit),
    })),
    placed: traceOf(row.placedAt, row.placedByStaffId, row.placedByName, row.placedByRole),
    cancelled: traceOf(
      row.cancelledAt,
      row.cancelledByStaffId,
      row.cancelledByName,
      row.cancelledByRole,
    ),
    arrived: traceOf(row.arrivedAt, row.arrivedByStaffId, row.arrivedByName, row.arrivedByRole),
    // L'affichage du lancement (R4a) : un nom absent reste `null`.
    launched: row.launchedAt === null ? null : { at: row.launchedAt, byName: row.launchedByName },
    // L'affichage du départ (R4d) : une tournée sans livreur laisse le nom `null`.
    departed: row.departedAt === null ? null : { at: row.departedAt, byName: row.departedByName },
  };
}

/**
 * Un geste daté relu : `null` sans instant. Le CHECK de la base le tient
 * entier ; le repli vide ne sert qu'au typage des colonnes nullables.
 */
function traceOf(
  at: Date | null,
  staffUserId: string | null,
  name: string | null,
  role: string | null,
): SiteResupplySnapshot["placed"] {
  if (at === null) {
    return null;
  }
  return { at, author: { staffUserId: staffUserId ?? "", name: name ?? "", role: role ?? "" } };
}
