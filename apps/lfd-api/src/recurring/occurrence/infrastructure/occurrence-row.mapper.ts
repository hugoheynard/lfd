import { z } from "zod";

import { Prisma } from "../../../platform/database/client/client.js";
import { BasketLine } from "../../basket/domain/value-objects/basket-line.js";
import { IsoDate } from "../../basket/domain/value-objects/iso-date.js";
import { Occurrence, type OccurrenceSnapshot } from "../domain/entities/occurrence.js";
import { OCCURRENCE_REFUSAL_CAUSES } from "../domain/refusal-cause.js";

const stateSchema = z.enum(["planned", "skipped", "placed", "refused", "missed", "cancelled"]);
const causeSchema = z.enum(OCCURRENCE_REFUSAL_CAUSES);
const linesSchema = z.array(z.object({ sku: z.string(), quantity: z.number().int() }));

/** Une ligne `recurring.occurrence` relue. */
export interface OccurrenceRow {
  readonly id: string;
  readonly basketId: string;
  readonly serviceDay: Date;
  readonly placeOn: Date;
  readonly state: string;
  readonly lines: Prisma.JsonValue;
  readonly note: string;
  readonly orderId: string | null;
  readonly cause: string | null;
  readonly reason: string | null;
  readonly settledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Une ligne relue → l'entité ; ses lignes revalident. */
export function occurrenceFromRow(row: OccurrenceRow): Occurrence {
  return Occurrence.reconstitute({
    id: row.id,
    basketId: row.basketId,
    serviceDay: IsoDate.fromDate(row.serviceDay),
    placeOn: IsoDate.fromDate(row.placeOn),
    state: stateSchema.parse(row.state),
    lines:
      row.lines === null
        ? null
        : linesSchema.parse(row.lines).map((line) => BasketLine.create(line.sku, line.quantity)),
    note: row.note,
    orderId: row.orderId,
    cause: row.cause === null ? null : causeSchema.parse(row.cause),
    reason: row.reason,
    settledAt: row.settledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** Les colonnes que l'état d'une échéance écrit. */
export function occurrenceColumns(snapshot: OccurrenceSnapshot) {
  return {
    state: snapshot.state,
    lines:
      snapshot.lines === null
        ? Prisma.DbNull
        : snapshot.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    note: snapshot.note,
    orderId: snapshot.orderId,
    cause: snapshot.cause,
    reason: snapshot.reason,
    settledAt: snapshot.settledAt,
    updatedAt: snapshot.updatedAt,
  };
}
