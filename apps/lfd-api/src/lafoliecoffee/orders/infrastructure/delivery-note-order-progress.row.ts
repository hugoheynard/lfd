import type { DeliveryNoteOrderProgress } from "../domain/ports/order-progress-for-delivery-note.js";
import type { OrderStatus } from "../../../platform/database/client/client.js";
import {
  DELIVERY_NOTE_LINE_SELECT,
  DELIVERY_NOTE_TERMS_SELECT,
  toDeliveryNoteOrder,
  type DeliveryNoteOrderRow,
} from "./delivery-note-order.row.js";

/**
 * La sélection commune des deux lecteurs du BL qui suit la commande : le
 * geste (`PrismaOrderProgressForDeliveryNote`) et le réconciliateur
 * (`PrismaOrdersToReconcileDeliveryNotes`) lisent la même forme, pour ne pas
 * décider sur deux vérités. Lignes par identifiant : l'ordre des lignes.
 */
export const DELIVERY_NOTE_PROGRESS_SELECT = {
  status: true,
  confirmedAt: true,
  readyAt: true,
  handedOverAt: true,
  receivedOn: true,
  ...DELIVERY_NOTE_TERMS_SELECT,
  lines: DELIVERY_NOTE_LINE_SELECT,
} as const;

interface ProgressRow extends DeliveryNoteOrderRow {
  readonly status: OrderStatus;
  readonly confirmedAt: Date | null;
  readonly readyAt: Date | null;
  readonly handedOverAt: Date | null;
  readonly receivedOn: Date | null;
}

/** Ligne → vue du BL. `received_on` est un `DATE` : son jour UTC est le jour écrit. */
export function toDeliveryNoteOrderProgress(row: ProgressRow): DeliveryNoteOrderProgress {
  return {
    ...toDeliveryNoteOrder(row),
    status: row.status,
    confirmedAt: row.confirmedAt,
    readyAt: row.readyAt,
    handedOverAt: row.handedOverAt,
    receivedOn: row.receivedOn === null ? null : row.receivedOn.toISOString().slice(0, 10),
  };
}
