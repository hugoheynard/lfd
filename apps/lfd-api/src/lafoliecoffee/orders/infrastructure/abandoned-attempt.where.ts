import {
  OrderStatus,
  PaymentStatus,
  type Prisma,
} from "../../../platform/database/client/client.js";

/**
 * **Une tentative de règlement par carte abandonnée**, écrite UNE fois : une
 * commande `cancelled` dont le règlement est `failed`. Elle garde son numéro,
 * mais sort de la liste des commandes du back-office et se consulte à part
 * (décidé par Hugo le 2026-11-13).
 *
 * Le critère est exact, et ces deux colonnes suffisent (vérifié le 2026-11-13) :
 *
 * - les cinq écritures qui annulent une carte non payée posent `cancelled` +
 *   `failed` — l'abandon du client (`markAbandoned`), l'expiration et le
 *   remplacement (`PrismaUnsettledShopOrderCanceller`), la clôture
 *   (`failAtClosing`), et l'annulation de l'équipe ou du client sur un
 *   règlement dû (`prisma-order-cancellation.repository.ts`, branche `DUE`) ;
 * - `failed` ne s'écrit que depuis `pending` (`FAILED_FROM`,
 *   `prisma-order.repository.ts`) : une commande payée n'y revient jamais.
 *   Payée puis annulée, elle reste `paid` ou passe `refunded` ; au compte ou à
 *   total nul, elle reste `not_required` — toutes restent dans la liste ;
 * - un pro dont la carte est refusée reste `placed` + `failed` jusqu'à la
 *   clôture : il est encore une commande à suivre, et reste dans la liste.
 */
export function abandonedAttemptWhere(): Prisma.OrderWhereInput {
  return { status: OrderStatus.cancelled, paymentStatus: PaymentStatus.failed };
}

/** Le complément : tout ce qui n'est pas une tentative abandonnée. */
export function notAbandonedAttemptWhere(): Prisma.OrderWhereInput {
  return { NOT: abandonedAttemptWhere() };
}
