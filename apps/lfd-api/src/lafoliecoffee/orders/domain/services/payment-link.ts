import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

/**
 * Le chemin, côté espace client, où se règle une commande en attente. Écrit ici
 * et nulle part ailleurs : c'est le backend qui fabrique le lien, et il doit
 * tomber sur une route que le front sert réellement.
 */
const SETTLE_PATH = "commandes";

/**
 * Le **lien de règlement** d'une commande, ou `null` si l'espace client n'a pas
 * d'adresse publique configurée.
 *
 * `null` plutôt qu'une URL fabriquée : `CLIENT_BASE_URL` est optionnelle, et
 * inventer une racine enverrait le client sur une page qui n'existe pas. L'appel
 * annonce alors qu'il n'y a pas de lien — la commande, elle, est passée, et le
 * client peut toujours la régler depuis son espace.
 */
export function paymentUrlFor(clientBaseUrl: string | null, orderId: string): string | null {
  if (clientBaseUrl === null || clientBaseUrl.trim() === "") {
    return null;
  }
  const root = clientBaseUrl.replace(/\/+$/u, "");
  return `${root}/${SETTLE_PATH}/${encodeURIComponent(orderId)}/regler`;
}

/** Les règlements qu'un lien peut encore solder : en attente, ou refusé et à reprendre. */
const AWAITING_CARD: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>(["pending", "failed"]);

/**
 * Une commande **attend-elle un règlement par carte** ? Règlement `pending` ou
 * `failed`, et commande non annulée — on ne fait pas payer ce qu'on ne
 * fabriquera pas. La même règle que la lecture de la page (plan liens de
 * paiement §2a), écrite une fois pour le renvoi du lien.
 */
export function awaitsCardPayment(status: OrderStatus, paymentStatus: PaymentStatus): boolean {
  return status !== "cancelled" && AWAITING_CARD.has(paymentStatus);
}

/** Les règlements à reprendre, pour le filtre de la lecture. */
export const AWAITING_CARD_PAYMENT_STATUSES = ["pending", "failed"] as const;
