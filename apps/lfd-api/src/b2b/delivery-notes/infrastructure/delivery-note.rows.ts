import type { Prisma } from "../../../platform/database/client/client.js";
import type { DeliveryNoteState } from "../domain/entities/delivery-note.js";
import { termsOf } from "./delivery-note-terms.columns.js";

/**
 * **Ligne ↔ état d'un BL**, partagé par le dépôt (écriture) et le lecteur
 * (plan E5a) : une seule lecture des colonnes, pour que le BL relu par la
 * fiche commande soit celui que l'agrégat écrit.
 */

const LINE_COLUMNS = {
  sku: true,
  productName: true,
  unitPriceMillicents: true,
  vatRate: true,
  quantity: true,
  lineTotalCents: true,
  unitPriceTtcCents: true,
  lineTotalTtcCents: true,
  pickupDiscountEligible: true,
} as const;

/** Les lignes d'un BL, dans leur ordre d'écriture. */
export const NOTE_INCLUDE = {
  lines: { orderBy: { id: "asc" }, select: LINE_COLUMNS },
} as const satisfies Prisma.DeliveryNoteInclude;

type NoteRow = Prisma.DeliveryNoteGetPayload<{ include: typeof NOTE_INCLUDE }>;

/** `received_on` est un `DATE` : son jour UTC est le jour écrit. */
function dayOf(date: Date | null): string | null {
  return date === null ? null : date.toISOString().slice(0, 10);
}

/** Le jour écrit, en `DATE`. */
export function dateOf(day: string | null): Date | null {
  return day === null ? null : new Date(`${day}T00:00:00.000Z`);
}

/** Une ligne relue → l'état du BL ; l'agrégat revalide à la réhydratation. */
export function stateOf(row: NoteRow): DeliveryNoteState {
  return {
    id: row.id,
    orderId: row.orderId,
    rank: row.rank,
    number: row.number,
    status: row.status,
    plannedAt: row.plannedAt,
    voidedAt: row.voidedAt,
    preparedAt: row.preparedAt,
    handedOverAt: row.handedOverAt,
    receivedOn: dayOf(row.receivedOn),
    terms: termsOf(row),
    lines: row.lines.map((line) => ({ ...line, vatRate: line.vatRate.toNumber() })),
  };
}
