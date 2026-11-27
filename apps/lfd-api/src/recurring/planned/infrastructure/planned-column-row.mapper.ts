import {
  billingAddressPayloadSchema,
  fulfillmentMethodSchema,
  fulfillmentWindowSchema,
  type PlannedColumnView,
} from "@lfd/contracts";
import { z } from "zod";

import { CorruptedRecordError } from "../../../platform/database/json-columns.js";
import type { Prisma } from "../../../platform/database/client/client.js";
import { IsoDate } from "../../basket/domain/value-objects/iso-date.js";
import { OCCURRENCE_REFUSAL_CAUSES } from "../../occurrence/domain/refusal-cause.js";
import {
  PlannedColumn,
  type PlannedColumnSnapshot,
  type PlannedRouting,
} from "../domain/entities/planned-column.js";
import { PlannedLine } from "../domain/value-objects/planned-line.js";

const statusSchema = z.enum(["draft", "placed", "refused", "missed", "withdrawn"]);
const causeSchema = z.enum(OCCURRENCE_REFUSAL_CAUSES);
const linesSchema = z.array(z.object({ sku: z.string(), quantity: z.number().int() }));
const routingSchema = z.object({
  method: fulfillmentMethodSchema,
  deliveryAddress: billingAddressPayloadSchema.nullable(),
  pickupAddressId: z.string().nullable(),
  window: fulfillmentWindowSchema,
});

/** Une ligne `recurring.planned_columns` relue. */
export interface PlannedColumnRow {
  readonly id: string;
  readonly userId: string;
  readonly companyId: string;
  readonly serviceDay: Date;
  readonly routing: Prisma.JsonValue;
  readonly lines: Prisma.JsonValue;
  readonly status: string;
  readonly convertsAt: Date | null;
  readonly orderId: string | null;
  readonly refusalCause: string | null;
  readonly refusalReason: string | null;
  readonly version: number;
}

/** Une ligne relue → l'agrégat ; ses lignes revalident. */
export function plannedColumnFromRow(row: PlannedColumnRow): PlannedColumn {
  return PlannedColumn.reconstitute({
    id: row.id,
    buyerUserId: row.userId,
    companyId: row.companyId,
    serviceDay: IsoDate.fromDate(row.serviceDay),
    routing: routingSchema.parse(row.routing),
    lines: linesSchema.parse(row.lines).map((line) => PlannedLine.create(line.sku, line.quantity)),
    status: statusSchema.parse(row.status),
    convertsAt: row.convertsAt,
    orderId: row.orderId,
    refusal:
      row.refusalCause === null
        ? null
        : { cause: causeSchema.parse(row.refusalCause), reason: row.refusalReason ?? "" },
    version: row.version,
  });
}

/** Une ligne relue → la vue de l'écran (jamais une colonne retirée : le lecteur les écarte). */
export function plannedColumnView(row: PlannedColumnRow): PlannedColumnView {
  const snapshot = plannedColumnFromRow(row).snapshot();
  const { status } = snapshot;
  if (status === "withdrawn") {
    // Le lecteur écarte les colonnes retirées dans son `where`.
    throw new CorruptedRecordError("planned_columns.status");
  }
  return {
    id: snapshot.id,
    day: snapshot.serviceDay.value,
    version: snapshot.version,
    status,
    routing: snapshot.routing,
    lines: snapshot.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    convertsAt: snapshot.convertsAt === null ? null : snapshot.convertsAt.toISOString(),
    orderId: snapshot.orderId,
    refusal: snapshot.refusal,
  };
}

/** Les colonnes que l'état d'une colonne écrit (hors identité et version). */
export function plannedColumnFields(snapshot: PlannedColumnSnapshot) {
  return {
    userId: snapshot.buyerUserId,
    windowStart: snapshot.routing.window.start,
    windowEnd: snapshot.routing.window.end,
    routing: routingJson(snapshot.routing),
    lines: snapshot.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    status: snapshot.status,
    convertsAt: snapshot.convertsAt,
    orderId: snapshot.orderId,
    refusalCause: snapshot.refusal?.cause ?? null,
    refusalReason: snapshot.refusal?.reason ?? null,
  };
}

function routingJson(routing: PlannedRouting) {
  return {
    method: routing.method,
    deliveryAddress: routing.deliveryAddress,
    pickupAddressId: routing.pickupAddressId,
    window: { start: routing.window.start, end: routing.window.end },
  };
}
