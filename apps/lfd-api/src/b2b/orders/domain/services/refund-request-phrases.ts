import { RefundRejectedError, type RefundRejection } from "../errors/order-refund-errors.js";
import type { RefundRequestState } from "../entities/order-refund-request.js";

const REJECTIONS: ReadonlySet<string> = new Set<RefundRejection>([
  "currency",
  "exceeds_charge",
  "amount_changed",
  "reversed_after_success",
]);

function isRejection(reason: string): reason is RefundRejection {
  return REJECTIONS.has(reason);
}

/**
 * **La phrase du dernier échec d'un remboursement demandé** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.9) — lue par
 * l'équipe sous le bandeau, sans le code sous les yeux. Pure. Un code inconnu
 * se dit tel quel plutôt que d'être tu.
 */
export function refundFailurePhraseOf(
  state: RefundRequestState,
  lastFailure: string | null,
  attempts: number,
): string | null {
  if (state === "failed") {
    return "La banque a refusé le remboursement chez Stripe : relancez, ou remboursez le client par virement.";
  }
  if (state !== "to_issue" || lastFailure === null) {
    return null;
  }
  if (lastFailure === "unavailable") {
    return `Stripe n'a pas répondu (${String(attempts)} essai${attempts > 1 ? "s" : ""}). Le système réessaie tout seul.`;
  }
  if (lastFailure === "nothing_left") {
    return "Stripe dit le paiement déjà rendu, mais la commande ne le sait pas : vérifiez le tableau de bord Stripe.";
  }
  if (lastFailure === "no_payment_intent") {
    return "La commande ne porte aucun paiement Stripe à rembourser : remboursez le client autrement.";
  }
  const [kind, code = ""] = lastFailure.split(":");
  if (kind === "declined") {
    return `Stripe a refusé le remboursement (${code}). Remboursez le client autrement (virement).`;
  }
  if (kind === "rejected" && isRejection(code)) {
    return new RefundRejectedError(code).message;
  }
  return `Le remboursement n'est pas parti (${lastFailure}).`;
}
