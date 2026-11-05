import { freeDeliveryOf, type FreeDelivery } from "../domain/value-objects/free-delivery.js";
import { FrozenAdjustmentUnreadableError } from "./frozen-adjustment-unreadable.error.js";

/**
 * Les colonnes du franco figé (`orders.free_delivery_*`, migration
 * `20261105160000`, plan `plan-livraison-offerte.md`, 1a) — une seule
 * traduction, pour que le bon partiel, le soldé et la reprise des remises
 * lisent la même chose.
 */
export const FREE_DELIVERY_SELECT = {
  freeDeliveryThresholdCents: true,
  freeDeliveryWaivedCents: true,
  freeDeliveryWaivedTtcCents: true,
} as const;

/** La forme que Prisma rend pour {@link FREE_DELIVERY_SELECT}. */
export interface FreeDeliveryRow {
  readonly freeDeliveryThresholdCents: number | null;
  readonly freeDeliveryWaivedCents: number | null;
  readonly freeDeliveryWaivedTtcCents: number | null;
}

/**
 * Le franco relu, ou `null` sans franco. Le CHECK
 * `orders_free_delivery_together` tient le seuil et le montant ensemble ; l'un
 * sans l'autre est une ligne écrite hors de l'application.
 *
 * @throws {FrozenAdjustmentUnreadableError}
 */
export function freeDeliveryOfRow(orderId: string, row: FreeDeliveryRow): FreeDelivery | null {
  const thresholdCents = row.freeDeliveryThresholdCents;
  const waivedCents = row.freeDeliveryWaivedCents;
  if (thresholdCents === null && waivedCents === null) {
    return null;
  }
  if (thresholdCents === null || waivedCents === null) {
    throw new FrozenAdjustmentUnreadableError(orderId, "livraison offerte");
  }
  return freeDeliveryOf({
    thresholdCents,
    waivedCents,
    waivedTtcCents: row.freeDeliveryWaivedTtcCents,
  });
}
