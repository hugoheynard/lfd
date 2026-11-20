import { z } from "zod";

import { Prisma } from "../../../platform/database/client/client.js";
import {
  freeDeliveryOf,
  type FreeDelivery,
  type FreeDeliveryPromotion,
} from "../domain/value-objects/free-delivery.js";
import { FrozenAdjustmentUnreadableError } from "./frozen-adjustment-unreadable.error.js";

/**
 * Les colonnes de la livraison offerte figée (`orders.free_delivery_*`,
 * migrations `20261105160000` et `20261120120000`, plan
 * `plan-livraison-offerte.md`, 1a et § 2.8) — une seule traduction, pour que
 * le bon partiel, le soldé, la reprise des remises et les documents lisent la
 * même chose.
 */
export const FREE_DELIVERY_SELECT = {
  freeDeliveryThresholdCents: true,
  freeDeliveryWaivedCents: true,
  freeDeliveryWaivedTtcCents: true,
  freeDeliveryPromotionId: true,
  freeDeliveryPromotionThresholdCents: true,
  freeDeliveryLabel: true,
} as const;

/** La forme que Prisma rend pour {@link FREE_DELIVERY_SELECT}. */
export interface FreeDeliveryRow {
  readonly freeDeliveryThresholdCents: number | null;
  readonly freeDeliveryWaivedCents: number | null;
  readonly freeDeliveryWaivedTtcCents: number | null;
  readonly freeDeliveryPromotionId: string | null;
  readonly freeDeliveryPromotionThresholdCents: number | null;
  readonly freeDeliveryLabel: Prisma.JsonValue | null;
}

/** Ce que la passation et la révision écrivent. */
export interface FreeDeliveryColumns extends Omit<FreeDeliveryRow, "freeDeliveryLabel"> {
  readonly freeDeliveryLabel: { fr: string; en: string; it: string } | typeof Prisma.DbNull;
}

/**
 * La livraison offerte → ses six colonnes, écrites par la passation et par la
 * révision de la même façon. Sans livraison offerte, toutes à `NULL` : une
 * révision qui la perd efface ce que la commande portait, promotion comprise.
 */
export function freeDeliveryColumnsOf(freeDelivery: FreeDelivery | null): FreeDeliveryColumns {
  const promotion = freeDelivery?.promotion ?? null;
  return {
    freeDeliveryThresholdCents: freeDelivery?.thresholdCents ?? null,
    freeDeliveryWaivedCents: freeDelivery?.waivedCents ?? null,
    freeDeliveryWaivedTtcCents: freeDelivery?.waivedTtcCents ?? null,
    freeDeliveryPromotionId: promotion?.promotionId ?? null,
    freeDeliveryPromotionThresholdCents: promotion?.thresholdCents ?? null,
    freeDeliveryLabel:
      promotion === null
        ? Prisma.DbNull
        : { fr: promotion.label.fr, en: promotion.label.en, it: promotion.label.it },
  };
}

/**
 * La livraison offerte relue, ou `null` sans elle. Les CHECK
 * `orders_free_delivery_*` tiennent la forme ; une ligne qui la contredit a
 * été écrite hors de l'application, et la lecture le nomme.
 *
 * @throws {FrozenAdjustmentUnreadableError}
 */
export function freeDeliveryOfRow(orderId: string, row: FreeDeliveryRow): FreeDelivery | null {
  const waivedCents = row.freeDeliveryWaivedCents;
  const promotion = promotionOfRow(orderId, row);
  if (waivedCents === null) {
    if (row.freeDeliveryThresholdCents !== null || promotion !== null) {
      throw new FrozenAdjustmentUnreadableError(orderId, "livraison offerte");
    }
    return null;
  }
  if (row.freeDeliveryThresholdCents === null && promotion === null) {
    throw new FrozenAdjustmentUnreadableError(orderId, "livraison offerte");
  }
  return freeDeliveryOf({
    thresholdCents: row.freeDeliveryThresholdCents,
    waivedCents,
    waivedTtcCents: row.freeDeliveryWaivedTtcCents,
    promotion,
  });
}

const labelSchema = z.object({ fr: z.string(), en: z.string(), it: z.string() });

/** La promotion figée : les trois colonnes ensemble, ou aucune. */
function promotionOfRow(orderId: string, row: FreeDeliveryRow): FreeDeliveryPromotion | null {
  const promotionId = row.freeDeliveryPromotionId;
  const thresholdCents = row.freeDeliveryPromotionThresholdCents;
  if (promotionId === null && thresholdCents === null && row.freeDeliveryLabel === null) {
    return null;
  }
  const label = labelSchema.safeParse(row.freeDeliveryLabel);
  if (promotionId === null || thresholdCents === null || !label.success) {
    throw new FrozenAdjustmentUnreadableError(orderId, "promotion de la livraison offerte");
  }
  return { promotionId, thresholdCents, label: label.data };
}
