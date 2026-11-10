import type { RefundRejection } from "../errors/order-refund-errors.js";

/**
 * Fait de domaine : **un remboursement Stripe a été refusé par la commande**
 * (lot R1). Rien n'a été écrit ; l'argent, lui, est peut-être déjà rendu chez
 * Stripe. Ce fait existe pour que quelqu'un regarde : il fait sonner la
 * cloche du back-office.
 */
export class OrderRefundRejectedEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** `re_…` — la clé de la cloche : un rejeu ne sonne pas deux fois. */
    readonly stripeRefundId: string,
    readonly amountCents: number,
    readonly reason: RefundRejection,
  ) {}
}
