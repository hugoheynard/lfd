import { BusinessError, TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * La suggestion que le bureau a sous les yeux n'existe plus telle qu'il l'a
 * vue (`gps-y-aller-et-position.md`, §6) : de nouvelles livraisons ont
 * déplacé le point, quelqu'un l'a déjà appliquée ou ignorée, ou le carnet a
 * été corrigé entre-temps. Rien n'est écrit : on ne pose pas un point que
 * personne n'a regardé.
 */
export class AddressSuggestionChangedError extends BusinessError {
  constructor() {
    super(
      "delivery.address_suggestion_changed",
      "Cette suggestion a changé ou n'existe plus depuis l'affichage (nouvelles livraisons, décision d'un collègue, ou carnet corrigé entre-temps). Rien n'a été écrit : rechargez la liste des suggestions.",
    );
  }
}

/**
 * Le verrou d'une suggestion a été demandé hors d'une unité de travail — une
 * faute de câblage : un verrou consultatif de transaction pris en autocommit
 * est relâché à la fin de sa propre instruction.
 */
export class AddressSuggestionLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "delivery.address_suggestion_lock_outside_transaction",
      "Le verrou d'une suggestion de point exige une transaction ouverte : le prendre sous UnitOfWork.run.",
    );
  }
}
