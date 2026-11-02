import {
  stockAlertLevelOf,
  stockAlertLiftReasonOf,
  type StockAlertLift,
  type StockAlertSnapshot,
} from "../domain/stock-alert.js";
import { UnreadableResupplyRowError } from "../domain/resupply-unreadable-row-error.js";
import { wholeTraceOf } from "./trace-columns.js";

/** La ligne `site_stock_alert` telle que Prisma la rend. */
export interface StockAlertRow {
  readonly id: string;
  readonly siteId: string;
  readonly sku: string;
  readonly label: string;
  readonly level: string;
  readonly version: number;
  readonly declaredAt: Date;
  readonly declaredByStaffId: string;
  readonly declaredByName: string;
  readonly declaredByRole: string;
  readonly liftedAt: Date | null;
  readonly liftedByStaffId: string | null;
  readonly liftedByName: string | null;
  readonly liftedByRole: string | null;
  readonly liftReason: string | null;
}

/** Ligne → instantané du domaine. Niveau et raison revalident. */
export function stockAlertSnapshotOf(row: StockAlertRow): StockAlertSnapshot {
  return {
    id: row.id,
    siteId: row.siteId,
    sku: row.sku,
    label: row.label,
    level: stockAlertLevelOf(row.level),
    version: row.version,
    declared: {
      at: row.declaredAt,
      author: {
        staffUserId: row.declaredByStaffId,
        name: row.declaredByName,
        role: row.declaredByRole,
      },
    },
    lifted: liftOf(row),
  };
}

/**
 * La levée relue : `null` sans instant ; un instant sans raison ni auteur
 * entier est refusé, jamais comblé (audit du réassort, 2026-11-02).
 */
function liftOf(row: StockAlertRow): StockAlertLift | null {
  const origin = { table: "site_stock_alert", rowId: row.id, gesture: "levée" };
  const trace = wholeTraceOf(
    {
      at: row.liftedAt,
      staffUserId: row.liftedByStaffId,
      name: row.liftedByName,
      role: row.liftedByRole,
    },
    origin,
  );
  if (trace === null) {
    return null;
  }
  if (row.liftReason === null) {
    throw new UnreadableResupplyRowError(origin.table, origin.rowId, origin.gesture);
  }
  return { ...trace, reason: stockAlertLiftReasonOf(row.liftReason) };
}
