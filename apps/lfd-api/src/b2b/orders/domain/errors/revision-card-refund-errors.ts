import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import type { RevisionActor } from "../entities/order-revision.js";

/**
 * **Les restes des paiements ne couvrent pas la baisse** (plan
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12) — un
 * remboursement déjà demandé sur la commande les occupe. Le geste de sortie
 * dépend de la demande qui les occupe : arrêtée, elle attend l'équipe
 * (« Relancer » ou « Rendu autrement », bandeau des remboursements de la
 * fiche) ; en cours, elle se termine toute seule.
 */
export class CardRefundNotCoveredError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly stopped: boolean,
    readonly by: RevisionActor["kind"],
  ) {
    super("orders.revise.card_refund_not_covered", notCoveredWordsOf(stopped, by));
  }
}

function notCoveredWordsOf(stopped: boolean, by: RevisionActor["kind"]): string {
  if (!stopped) {
    return "Un remboursement est en cours sur cette commande : réessayez la modification quand il sera fait.";
  }
  return by === "staff"
    ? "Un remboursement est arrêté sur cette commande : relancez-le ou marquez-le rendu autrement " +
        "(bandeau des remboursements de la fiche) avant toute nouvelle baisse."
    : "Un remboursement est arrêté sur cette commande : contactez-nous pour le débloquer avant toute nouvelle baisse.";
}
