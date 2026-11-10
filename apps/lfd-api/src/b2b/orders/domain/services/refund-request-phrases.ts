import type { AdminRefundRequestState } from "@lfd/contracts";

import { RefundRejectedError, type RefundRejection } from "../errors/order-refund-errors.js";

const REJECTIONS: ReadonlySet<string> = new Set<RefundRejection>([
  "currency",
  "exceeds_charge",
  "amount_changed",
  "reversed_after_success",
]);

function isRejection(reason: string): reason is RefundRejection {
  return REJECTIONS.has(reason);
}

/** Ce qu'on dit d'une demande arrêtée dont le code est connu, en dehors des familles. */
const STOPPED: Readonly<Record<string, string>> = {
  refund_failed:
    "La banque a refusé le remboursement chez Stripe : relancez, ou remboursez le client autrement puis notez-le « rendu autrement ».",
  refund_canceled:
    "Le remboursement a été annulé chez Stripe : relancez, ou remboursez le client autrement puis notez-le « rendu autrement ».",
  reversed:
    "Un remboursement réussi a été repris par la banque : l'argent n'est plus rendu. Relancez, ou remboursez le client autrement.",
  nothing_left:
    "Stripe dit le paiement déjà rendu, mais la commande ne le sait pas : vérifiez le tableau de bord Stripe.",
  no_intent:
    "La commande ne porte aucun paiement Stripe à rembourser : remboursez le client autrement.",
  issued_amount_mismatch:
    "Stripe a remboursé un autre montant que celui demandé : vérifiez le tableau de bord Stripe.",
};

/** Une demande née arrêtée (une inversion) n'a pas d'échec : elle attend une décision. */
const AWAITING_DECISION =
  "Ce remboursement attend une décision : relancez-le, ou remboursez le client autrement puis notez-le « rendu autrement ».";

/**
 * **La phrase du dernier échec d'une demande de remboursement** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.9 ; plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, §5.3) — lue par l'équipe sous le bandeau, sans le code sous les yeux.
 * Pure. `lastFailure` est le code BRUT que rend le bloc `card-payment` ; un
 * code inconnu se dit tel quel plutôt que d'être tu.
 *
 * Une demande rendue (`refunded`, `settled_elsewhere`) ou en attente de la
 * banque (`issued`) n'a pas de phrase ; une `to_issue` n'en a qu'après un
 * essai qui n'a pas abouti.
 */
export function refundFailurePhraseOf(
  state: AdminRefundRequestState,
  lastFailure: string | null,
  attempts: number,
): string | null {
  switch (state) {
    case "refunded":
    case "settled_elsewhere":
    case "issued":
      return null;
    case "to_issue":
      return toIssuePhraseOf(lastFailure, attempts);
    case "stopped":
      return lastFailure === null ? AWAITING_DECISION : stoppedPhraseOf(lastFailure);
  }
}

function toIssuePhraseOf(lastFailure: string | null, attempts: number): string | null {
  if (lastFailure === null) {
    return null;
  }
  if (lastFailure === "unavailable") {
    return `Stripe n'a pas répondu (${String(attempts)} essai${attempts > 1 ? "s" : ""}). Le système réessaie tout seul.`;
  }
  return unknownPhraseOf(lastFailure);
}

function stoppedPhraseOf(lastFailure: string): string {
  const known = STOPPED[lastFailure];
  if (known !== undefined) {
    return known;
  }
  const [kind, code = ""] = lastFailure.split(":");
  if (kind === "declined") {
    return `Stripe a refusé le remboursement (${code}). Remboursez le client autrement (virement), puis notez-le « rendu autrement ».`;
  }
  if (kind === "rejected" && isRejection(code)) {
    return new RefundRejectedError(code).message;
  }
  return unknownPhraseOf(lastFailure);
}

function unknownPhraseOf(lastFailure: string): string {
  return `Le remboursement n'est pas parti (${lastFailure}).`;
}
