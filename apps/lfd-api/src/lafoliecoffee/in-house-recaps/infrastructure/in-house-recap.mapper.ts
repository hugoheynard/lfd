import { InHouseRecap, type InHouseRecapState } from "../domain/entities/in-house-recap.js";
import { RecapMonth } from "../domain/value-objects/recap-month.js";

/** La ligne relue, avec ses lignes et ses BL (la forme de `RECAP_SELECT`). */
export interface InHouseRecapRow {
  readonly id: string;
  readonly payerId: string;
  readonly month: string;
  readonly number: string;
  readonly issuedAt: Date;
  readonly storageKey: string | null;
  readonly replacedById: string | null;
  readonly lines: readonly {
    readonly sku: string;
    readonly productName: string;
    readonly saleUnit: string;
    readonly quantity: number;
  }[];
  readonly notes: readonly {
    readonly deliveryNoteId: string;
    readonly number: string;
    readonly handedOverAt: Date;
    readonly contentVersion: number;
    readonly replacedAt: Date | null;
  }[];
}

/** Ce que l'adaptateur relit : les lignes dans l'ordre de leur rang. */
export const RECAP_SELECT = {
  id: true,
  payerId: true,
  month: true,
  number: true,
  issuedAt: true,
  storageKey: true,
  replacedById: true,
  lines: {
    orderBy: { position: "asc" },
    select: { sku: true, productName: true, saleUnit: true, quantity: true },
  },
  notes: {
    orderBy: { handedOverAt: "asc" },
    select: {
      deliveryNoteId: true,
      number: true,
      handedOverAt: true,
      contentVersion: true,
      replacedAt: true,
    },
  },
} as const;

/** Ligne → agrégat ; le mois revalide sa clé. */
export function toDomain(row: InHouseRecapRow): InHouseRecap {
  const state: InHouseRecapState = {
    id: row.id,
    payerId: row.payerId,
    month: RecapMonth.fromKey(row.month),
    number: row.number,
    issuedAt: row.issuedAt,
    storageKey: row.storageKey,
    replacedById: row.replacedById,
    replacedAt: row.notes[0]?.replacedAt ?? null,
    lines: row.lines,
    notes: row.notes.map(({ deliveryNoteId, number, handedOverAt, contentVersion }) => ({
      deliveryNoteId,
      number,
      handedOverAt,
      contentVersion,
    })),
  };
  return InHouseRecap.rehydrate(state);
}
