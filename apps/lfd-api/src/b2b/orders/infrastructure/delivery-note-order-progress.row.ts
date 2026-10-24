import type { DeliveryNoteOrderProgress } from "../domain/ports/order-progress-for-delivery-note.js";
import type { OrderStatus } from "../../../platform/database/client/client.js";

/**
 * La sélection commune des deux lecteurs du BL qui suit la commande : le
 * geste (`PrismaOrderProgressForDeliveryNote`) et le réconciliateur
 * (`PrismaOrdersToReconcileDeliveryNotes`) lisent la même forme, pour ne pas
 * décider sur deux vérités. Lignes par identifiant : l'ordre des lignes.
 */
export const DELIVERY_NOTE_PROGRESS_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  confirmedAt: true,
  readyAt: true,
  handedOverAt: true,
  receivedOn: true,
  lines: {
    orderBy: { id: "asc" },
    select: {
      sku: true,
      productNameSnapshot: true,
      unitPriceMillicents: true,
      vatRate: true,
      quantity: true,
      lineTotalCents: true,
      unitPriceTtcCents: true,
      lineTotalTtcCents: true,
    },
  },
} as const;

interface ProgressRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly confirmedAt: Date | null;
  readonly readyAt: Date | null;
  readonly handedOverAt: Date | null;
  readonly receivedOn: Date | null;
  readonly lines: readonly {
    readonly sku: string;
    readonly productNameSnapshot: string;
    readonly unitPriceMillicents: number;
    readonly vatRate: { toNumber(): number };
    readonly quantity: number;
    readonly lineTotalCents: number;
    readonly unitPriceTtcCents: number | null;
    readonly lineTotalTtcCents: number | null;
  }[];
}

/** Ligne → vue du BL. `received_on` est un `DATE` : son jour UTC est le jour écrit. */
export function toDeliveryNoteOrderProgress(row: ProgressRow): DeliveryNoteOrderProgress {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    confirmedAt: row.confirmedAt,
    readyAt: row.readyAt,
    handedOverAt: row.handedOverAt,
    receivedOn: row.receivedOn === null ? null : row.receivedOn.toISOString().slice(0, 10),
    lines: row.lines.map(({ productNameSnapshot, vatRate, ...line }) => ({
      ...line,
      productName: productNameSnapshot,
      vatRate: vatRate.toNumber(),
    })),
  };
}
