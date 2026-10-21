import {
  stockAlertLevelOf,
  stockAlertLiftReasonOf,
  type StockAlertSnapshot,
} from "../domain/stock-alert.js";

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
    lifted:
      row.liftedAt === null
        ? null
        : {
            at: row.liftedAt,
            reason: stockAlertLiftReasonOf(row.liftReason ?? ""),
            author: {
              staffUserId: row.liftedByStaffId ?? "",
              name: row.liftedByName ?? "",
              role: row.liftedByRole ?? "",
            },
          },
  };
}
