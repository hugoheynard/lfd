import {
  CustomerCancellationNotRecordedError,
  CustomerCancellationRefusedError,
} from "../../domain/errors/customer-cancellation-errors.js";
import {
  OrderCancellationNotRecordedError,
  OrderCancellationPaymentInProgressError,
  OrderCancellationProviderUnavailableError,
  OrderNotCancellableError,
} from "../../domain/errors/order-cancellation-errors.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { customerRefusalOf } from "../../domain/services/customer-cancellation-refusal.js";

/**
 * **Le refus du noyau, dit à un client** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.7).
 * Le noyau lève les erreurs staff — leurs phrases parlent à l'équipe et
 * citent parfois une autre commande ; le client reçoit un code
 * `orders.customer_cancel.*` et sa propre phrase. Ce qui n'est pas un refus
 * de l'annulation (404, motif invalide, panne) passe tel quel.
 */
export function customerErrorOf(error: unknown, orderId: string): unknown {
  if (error instanceof OrderNotCancellableError) {
    const refusal = customerRefusalOf(error.block);
    // Un brouillon n'existe pas pour un client : le même 404 que l'étranger.
    return refusal === null
      ? new OrderNotFoundError(orderId)
      : new CustomerCancellationRefusedError(refusal, undefined, error);
  }
  if (error instanceof OrderCancellationPaymentInProgressError) {
    return new CustomerCancellationRefusedError("payment_in_progress", undefined, error);
  }
  if (error instanceof OrderCancellationProviderUnavailableError) {
    return new CustomerCancellationRefusedError("not_recorded", undefined, error);
  }
  if (error instanceof OrderCancellationNotRecordedError) {
    return new CustomerCancellationNotRecordedError(error);
  }
  return error;
}
