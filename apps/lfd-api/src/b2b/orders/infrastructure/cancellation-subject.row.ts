import type { CancellationSubject } from "../domain/ports/cancellation-subject.reader.js";

/**
 * Ce que l'annulation staff lit d'une commande — partagé par la lecture sans
 * verrou et la relecture sous `FOR UPDATE`, pour qu'elles ne divergent pas.
 */
export const CANCELLATION_SUBJECT_SELECT = {
  id: true,
  orderNumber: true,
  placedByUserId: true,
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
  readonly status: CancellationSubject["status"];
  readonly paymentStatus: CancellationSubject["paymentStatus"];
  readonly totalCents: number;
  readonly requestedDeliveryDate: Date | null;
  readonly cancelledAt: Date | null;
  readonly stripePaymentIntentId: string | null;
  readonly loyaltyVoucherId: string | null;
}

/** La ligne → le sujet. `@db.Date` lu à minuit UTC : on garde le jour tel quel. */
export function toCancellationSubject(row: CancellationSubjectRow): CancellationSubject {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    placedByUserId: row.placedByUserId,
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
  };
}
