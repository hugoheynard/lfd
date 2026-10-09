import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
  type Prisma,
} from "../../../platform/database/client/client.js";

/**
 * **Le périmètre de l'expiration boutique**, écrit UNE fois (plan
 * `documentation/order/commande-carte-reglee.md`, §4.1) : une commande
 * `placed`, non réglée (`pending` ou `failed`), passée par le particulier
 * lui-même, sans société, de clientèle `public`, avec une intention directe.
 *
 * Le lecteur et l'écriture l'épandent tous les deux : une commande que le
 * lecteur ne verrait pas, l'écriture ne peut pas l'annuler, et réciproquement.
 *
 * « Passée par le staff » se lit à `placedByStaffId` — c'est le critère du
 * rappel des liens de règlement (`prisma-unpaid-link-order.reader.ts`, vérifié
 * le 2026-10-09).
 */
export function unsettledShopOrderWhere(): Prisma.OrderWhereInput {
  return {
    status: OrderStatus.placed,
    paymentStatus: { in: [PaymentStatus.pending, PaymentStatus.failed] },
    clientele: OrderClientele.public,
    companyId: null,
    placedByStaffId: null,
    stripePaymentIntentId: { not: null },
  };
}
