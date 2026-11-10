import { serviceDayOfColumn } from "./day-column.js";
import { resupplySaleUnitOf } from "../domain/resupply-sale-unit.js";
import { resupplyOriginOf } from "../domain/resupply-origin.js";
import {
  isPlaced,
  type PlacedSiteResupplySnapshot,
  resupplyTargetOf,
  type SiteResupplySnapshot,
} from "../domain/site-resupply.js";
import { UnreadableResupplyRowError } from "../domain/resupply-unreadable-row-error.js";
import { wholeTraceOf } from "./trace-columns.js";

const TABLE = "site_resupply";

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
 * `…_arrival_whole`) ; un geste relu sans son auteur entier est refusé
 * (`UnreadableResupplyRowError`), jamais comblé de chaînes vides.
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
    placed: wholeTraceOf(
      {
        at: row.placedAt,
        staffUserId: row.placedByStaffId,
        name: row.placedByName,
        role: row.placedByRole,
      },
      { table: TABLE, rowId: row.id, gesture: "envoi" },
    ),
    cancelled: wholeTraceOf(
      {
        at: row.cancelledAt,
        staffUserId: row.cancelledByStaffId,
        name: row.cancelledByName,
        role: row.cancelledByRole,
      },
      { table: TABLE, rowId: row.id, gesture: "annulation" },
    ),
    arrived: wholeTraceOf(
      {
        at: row.arrivedAt,
        staffUserId: row.arrivedByStaffId,
        name: row.arrivedByName,
        role: row.arrivedByRole,
      },
      { table: TABLE, rowId: row.id, gesture: "arrivée" },
    ),
    // L'affichage du lancement (R4a) : un nom absent reste `null`.
    launched: row.launchedAt === null ? null : { at: row.launchedAt, byName: row.launchedByName },
    // L'affichage du départ (R4d) : une tournée sans livreur laisse le nom `null`.
    departed: row.departedAt === null ? null : { at: row.departedAt, byName: row.departedByName },
  };
}

/**
 * Ligne → instantané d'un réassort ENVOYÉ, pour les lectures dont le `where`
 * porte déjà `placedAt: { not: null }`. Un brouillon ici contredirait la
 * requête : refusé, au lieu d'être écarté en silence par un filtre qui
 * redisait le `where` (audit du réassort, 2026-11-02).
 */
export function placedSnapshotOf(row: SiteResupplyRow): PlacedSiteResupplySnapshot {
  const snapshot = snapshotOf(row);
  if (!isPlaced(snapshot)) {
    throw new UnreadableResupplyRowError(TABLE, row.id, "envoi");
  }
  return snapshot;
}
