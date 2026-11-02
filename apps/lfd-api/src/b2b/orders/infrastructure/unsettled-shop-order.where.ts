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
 * commande sur stock `placed`, non réglée, portant une intention — passée par
 * le client lui-même (particulier ou pro) OU envoyée au lien de paiement par
 * l'équipe. Cette dernière y entre depuis le 2026-11-02 (Hugo, §6 Q3 bis) :
 * un lien jamais réglé ne retient plus la vitrine sans limite. Une commande
 * au compte n'a pas d'intention (`PlaceOrderForCustomerHandler.settle`,
 * vérifié le 2026-11-02) : elle n'y entre jamais.
 */
export function unsettledShelfOrderWhere(): Prisma.OrderWhereInput {
  return {
    status: OrderStatus.placed,
    paymentStatus: { in: [PaymentStatus.pending, PaymentStatus.failed] },
    supply: OrderSupply.shelf,
    stripePaymentIntentId: { not: null },
  };
}

/** Ce que l'annulation de l'expiration peut écrire : l'un OU l'autre périmètre. */
export function expirableOrderWhere(): Prisma.OrderWhereInput {
  return { OR: [unsettledShopOrderWhere(), unsettledShelfOrderWhere()] };
}
