import {
  billingAddressPayloadSchema,
  fulfillmentMethodSchema,
  fulfillmentWindowSchema,
  recurrenceSchema,
} from "@lfd/contracts";
import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import { Basket, type BasketLifecycle } from "../domain/entities/basket.js";
import { BasketLine } from "../domain/value-objects/basket-line.js";
import { IsoDate } from "../domain/value-objects/iso-date.js";

const lifecycleSchema = z.enum(["active", "paused", "cancelled"]);

/** Ce qu'un chargement de panier lit en plus de ses colonnes. */
export const BASKET_INCLUDE = {
  lines: { select: { sku: true, quantity: true }, orderBy: { position: "asc" } },
} as const;

/** Une ligne `recurring.basket` relue, avec son gabarit. */
export interface BasketRow {
  readonly id: string;
  readonly buyerUserId: string;
  readonly companyId: string | null;
  readonly fromOrderId: string | null;
  readonly cadence: string;
  readonly status: string;
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly fulfillmentMethod: string;
  readonly deliveryAddress: Prisma.JsonValue;
  readonly pickupAddressId: string | null;
  readonly requestedWindow: Prisma.JsonValue;
  readonly note: string;
  readonly salesTermsKey: string;
  readonly salesTermsRevision: number;
  readonly salesTermsFileId: string | null;
  readonly salesTermsNextRevision: number | null;
  readonly salesTermsNextFileId: string | null;
  readonly salesTermsEffectiveOn: Date | null;
  readonly plannedUntil: Date | null;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
}

/** Une ligne relue → l'agrégat ; ses value objects revalident. */
export function basketFromRow(row: BasketRow): Basket {
  const status: BasketLifecycle = lifecycleSchema.parse(row.status);
  return Basket.reconstitute({
    id: row.id,
    buyerUserId: row.buyerUserId,
    companyId: row.companyId,
    fromOrderId: row.fromOrderId,
    cadence: recurrenceSchema.parse(row.cadence),
    status,
    startDate: IsoDate.fromDate(row.startDate),
    endDate: row.endDate === null ? null : IsoDate.fromDate(row.endDate),
    routing: {
      method: fulfillmentMethodSchema.parse(row.fulfillmentMethod),
      deliveryAddress:
        row.deliveryAddress === null
          ? null
          : billingAddressPayloadSchema.parse(row.deliveryAddress),
      pickupAddressId: row.pickupAddressId,
      window: fulfillmentWindowSchema.parse(row.requestedWindow),
    },
    note: row.note,
    lines: row.lines.map((line) => BasketLine.create(line.sku, line.quantity)),
    salesTerms: {
      key: row.salesTermsKey,
      revision: row.salesTermsRevision,
      fileId: row.salesTermsFileId,
    },
    nextSalesTerms:
      row.salesTermsNextRevision === null || row.salesTermsEffectiveOn === null
        ? null
        : {
            revision: row.salesTermsNextRevision,
            fileId: row.salesTermsNextFileId,
            effectiveOn: IsoDate.fromDate(row.salesTermsEffectiveOn),
          },
    plannedUntil: row.plannedUntil === null ? null : IsoDate.fromDate(row.plannedUntil),
  });
}
