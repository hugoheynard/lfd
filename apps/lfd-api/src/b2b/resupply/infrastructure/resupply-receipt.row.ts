import type { ResupplyReceiptSnapshot } from "../domain/resupply-receipt.js";

/** Une journée civile en colonne `DATE` : minuit UTC, que Postgres tronque au jour. */
export function receiptDayColumn(serviceDay: string): Date {
  return new Date(`${serviceDay}T00:00:00.000Z`);
}

/** Les lignes, dans l'ordre du réassort ou de la saisie. */
export const RECEIPT_LINES = {
  orderBy: { position: "asc" },
  select: { sku: true, label: true, expectedQuantity: true, quantity: true },
} as const;

/** La ligne telle que Prisma la rend, avec ses lignes. */
export interface ResupplyReceiptRow {
  readonly id: string;
  readonly siteId: string;
  readonly serviceDay: Date;
  readonly resupplyId: string | null;
  readonly version: number;
  readonly receivedAt: Date;
  readonly receivedByStaffId: string;
  readonly receivedByName: string;
  readonly receivedByRole: string;
  readonly updatedAt: Date;
  readonly updatedByStaffId: string;
  readonly updatedByName: string;
  readonly updatedByRole: string;
  readonly lines: readonly {
    readonly sku: string;
    readonly label: string;
    readonly expectedQuantity: number | null;
    readonly quantity: number;
  }[];
}

/** Ligne → instantané du domaine. Un reçu en base est toujours reçu. */
export function receiptSnapshotOf(row: ResupplyReceiptRow): ResupplyReceiptSnapshot {
  return {
    id: row.id,
    siteId: row.siteId,
    serviceDay: row.serviceDay.toISOString().slice(0, 10),
    resupplyId: row.resupplyId,
    version: row.version,
    lines: row.lines.map((line) => ({
      sku: line.sku,
      label: line.label,
      expectedQuantity: line.expectedQuantity,
      receivedQuantity: line.quantity,
    })),
    received: {
      at: row.receivedAt,
      author: {
        staffUserId: row.receivedByStaffId,
        name: row.receivedByName,
        role: row.receivedByRole,
      },
    },
    lastChange: {
      at: row.updatedAt,
      author: {
        staffUserId: row.updatedByStaffId,
        name: row.updatedByName,
        role: row.updatedByRole,
      },
    },
  };
}
