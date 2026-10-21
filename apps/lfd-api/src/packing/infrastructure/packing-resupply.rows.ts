import type {
  PackingResupplyLineSnapshot,
  PackingResupplySnapshot,
} from "../domain/entities/packing-resupply.js";

/** Les colonnes lues d'une fiche de réassort et de ses lignes. */
export const RESUPPLY_SELECT = {
  serviceDay: true,
  resupplyId: true,
  siteId: true,
  siteLabel: true,
  drawnAt: true,
  closedAt: true,
  closedBy: true,
  lines: {
    select: {
      sku: true,
      productName: true,
      quantity: true,
      packed: true,
      packedAt: true,
      packedBy: true,
    },
    orderBy: { sku: "asc" },
  },
} as const;

interface LineRow {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly packed: number | null;
  readonly packedAt: Date | null;
  readonly packedBy: string | null;
}

interface ResupplyRow {
  readonly serviceDay: string;
  readonly resupplyId: string;
  readonly siteId: string;
  readonly siteLabel: string | null;
  readonly drawnAt: Date;
  readonly closedAt: Date | null;
  readonly closedBy: string | null;
  readonly lines: readonly LineRow[];
}

function lineOf(row: LineRow): PackingResupplyLineSnapshot {
  return {
    sku: row.sku,
    productName: row.productName,
    quantity: row.quantity,
    // Les CHECK de la table interdisent l'un sans les autres.
    packed:
      row.packed === null || row.packedAt === null || row.packedBy === null
        ? null
        : { quantity: row.packed, at: row.packedAt, by: row.packedBy },
  };
}

/** Une ligne de `packing_resupply` et ses lignes → l'état de la fiche. */
export function resupplyOf(row: ResupplyRow): PackingResupplySnapshot {
  return {
    serviceDay: row.serviceDay,
    resupplyId: row.resupplyId,
    siteId: row.siteId,
    siteLabel: row.siteLabel,
    drawnAt: row.drawnAt,
    closed:
      row.closedAt === null || row.closedBy === null
        ? null
        : { at: row.closedAt, by: row.closedBy },
    lines: row.lines.map(lineOf),
  };
}
