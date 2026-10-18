import { z } from "zod";

import {
  MAX_AUDIENCE_EVENTS_PER_BATCH,
  PRODUCT_AUDIENCE_EVENTS,
} from "./product-audience.values.js";

/**
 * Contrat de fil des **compteurs d'audience anonymes** : la FORME du lot et de
 * la période relue. Les règles (emplacement selon le geste, SKU servi) vivent
 * dans le domaine de `b2b/recommendations`.
 */
export {
  MAX_AUDIENCE_EVENTS_PER_BATCH,
  NO_AUDIENCE_PLACEMENT,
  PRODUCT_AUDIENCE_EVENTS,
  type ProductAudienceBatchPayload,
  type ProductAudienceCounterView,
  type ProductAudienceEvent,
  type ProductAudienceEventInput,
} from "./product-audience.values.js";

/** Longueur d'un SKU ou d'un emplacement : borne de forme, pas règle métier. */
const MAX_TOKEN_LENGTH = 64;

export const productAudienceBatchSchema = z.object({
  events: z
    .array(
      z.object({
        sku: z.string().min(1).max(MAX_TOKEN_LENGTH),
        event: z.enum(PRODUCT_AUDIENCE_EVENTS),
        placement: z.string().min(1).max(MAX_TOKEN_LENGTH).optional(),
      }),
    )
    .min(1)
    .max(MAX_AUDIENCE_EVENTS_PER_BATCH),
});

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "jour attendu au format AAAA-MM-JJ");

/** `GET /admin/product-audience?from=&to=` — deux jours métier, bornes comprises. */
export const productAudienceCountersQuerySchema = z.object({ from: isoDay, to: isoDay });
export type ProductAudienceCountersQuery = z.infer<typeof productAudienceCountersQuerySchema>;
