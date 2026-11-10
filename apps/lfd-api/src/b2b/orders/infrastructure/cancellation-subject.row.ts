import type { CancellationSubject } from "../domain/ports/cancellation-subject.reader.js";
import type { RefundPosition } from "../domain/value-objects/refund-position.js";

/**
 * Ce que l'annulation staff lit d'une commande — partagé par la lecture sans
 * verrou et la relecture sous `FOR UPDATE`, pour qu'elles ne divergent pas.
 */
export const CANCELLATION_SUBJECT_SELECT = {
  id: true,
  orderNumber: true,
  placedByUserId: true,
  companyId: true,
  // Plan A1 : une livraison inscrite ne se retire pas (`delivery_after_plan`).
  fulfillmentMethod: true,
  // Lot L4 du jour J : une commande sur stock ne passe pas par le guichet du fournil.
  supply: true,
  status: true,
  paymentStatus: true,
  totalCents: true,
  requestedDeliveryDate: true,
  cancelledAt: true,
  stripePaymentIntentId: true,
  loyaltyVoucherId: true,
} as const;

interface CancellationSubjectRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly placedByUserId: string;
  readonly companyId: string | null;
  readonly fulfillmentMethod: CancellationSubject["fulfillmentMethod"];
  readonly supply: CancellationSubject["supply"];
  readonly status: CancellationSubject["status"];
  readonly paymentStatus: CancellationSubject["paymentStatus"];
  readonly totalCents: number;
  readonly requestedDeliveryDate: Date | null;
  readonly cancelledAt: Date | null;
  readonly stripePaymentIntentId: string | null;
  readonly loyaltyVoucherId: string | null;
}

/**
 * La ligne → le sujet. `@db.Date` lu à minuit UTC : on garde le jour tel quel.
 * Le reste à rendre vient du bloc `card-payment` (lot P1.c), lu à côté.
 */
export function toCancellationSubject(
  row: CancellationSubjectRow,
  refunds: RefundPosition,
): CancellationSubject {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    placedByUserId: row.placedByUserId,
    companyId: row.companyId,
    fulfillmentMethod: row.fulfillmentMethod,
    supply: row.supply,
    status: row.status,
    paymentStatus: row.paymentStatus,
    totalCents: row.totalCents,
    serviceDay:
      row.requestedDeliveryDate === null
        ? null
        : row.requestedDeliveryDate.toISOString().slice(0, 10),
    cancelledAt: row.cancelledAt,
    stripePaymentIntentId: row.stripePaymentIntentId,
    loyaltyVoucherId: row.loyaltyVoucherId,
    refunds,
  };
}
