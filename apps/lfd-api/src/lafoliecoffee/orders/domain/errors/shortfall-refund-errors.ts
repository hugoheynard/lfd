import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import type { ShortfallRefundCause } from "../services/shortfall-refund.js";

/** La phrase de chaque cause, et le geste de sortie, pour l'équipe qui lit le refus. */
const CAUSE_SENTENCES: Readonly<Record<ShortfallRefundCause, string>> = {
  already_invoiced:
    "une facture la porte déjà : un remboursement d'ajustement n'aurait jamais d'avoir. Rendez le reste à la main, avec un avoir.",
  increase_pending:
    "une hausse par carte est en cours. Réglez-la depuis la fiche commande (payée et appliquée, ou abandonnée), puis recommencez.",
  unattributed_refund:
    "un remboursement a été fait hors de la plateforme, et l'on ne sait pas ce qu'il a rendu. Rendez le reste à la main.",
  payment_not_paid:
    "un de ses paiements par carte n'est pas encaissé. Attendez l'encaissement, puis recommencez.",
  not_covered:
    "ce qui reste sur ses paiements ne couvre pas le reste. Si un remboursement est arrêté, « Relancer » ou « Réglé autrement » d'abord, puis recommencez.",
};

/**
 * **« Rembourser le reste » refusé** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.5) : la
 * cause relue sous le verrou bloque encore. Rien n'a été écrit.
 */
export class ShortfallRefundBlockedError extends BusinessError {
  constructor(reference: string, cause: ShortfallRefundCause) {
    super(
      `orders.shortfall_refund.${cause}`,
      `Le reste de ${reference} n'est pas remboursé : ${CAUSE_SENTENCES[cause]}`,
    );
  }
}

/**
 * Rien à rembourser : la commande n'est pas un départ incomplet payé par carte
 * et soldé, ou son reste est déjà demandé ou rendu.
 */
export class NoShortfallRefundError extends BusinessError {
  constructor(reference: string) {
    super(
      "orders.shortfall_refund.nothing",
      `Il n'y a rien à rembourser sur ${reference} : le reste est déjà demandé ou rendu, ` +
        "ou la commande n'est pas un départ incomplet payé par carte et soldé. Rechargez la fiche commande.",
    );
  }
}
