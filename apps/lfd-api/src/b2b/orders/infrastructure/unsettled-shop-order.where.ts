import {
  OrderClientele,
  OrderStatus,
  OrderSupply,
  PaymentStatus,
  type Prisma,
} from "../../../platform/database/client/client.js";

/**
 * **Le périmètre de l'expiration boutique**, écrit UNE fois (plan
 * `documentation/commandes/reglement/commande-carte-reglee.md`, §4.1) : une commande
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

/**
 * **Le périmètre de la tenue du stock** (plan du jour J, §11.2, lot L4) : une
 * commande sur stock `placed`, non réglée, passée par le client lui-même —
 * particulier ou pro — avec une intention directe. Celle que l'équipe a
 * envoyée au lien de paiement n'y entre pas : elle attend dans la file du
 * comptoir et garde sa part tant qu'elle vit (§6, Q3 bis).
 */
export function unsettledShelfOrderWhere(): Prisma.OrderWhereInput {
  return {
    status: OrderStatus.placed,
    paymentStatus: { in: [PaymentStatus.pending, PaymentStatus.failed] },
    supply: OrderSupply.shelf,
    placedByStaffId: null,
    stripePaymentIntentId: { not: null },
  };
}

/** Ce que l'annulation de l'expiration peut écrire : l'un OU l'autre périmètre. */
export function expirableOrderWhere(): Prisma.OrderWhereInput {
  return { OR: [unsettledShopOrderWhere(), unsettledShelfOrderWhere()] };
}
