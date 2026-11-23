import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un motif d'offre mal formé : nature hors registre, texte vide ou trop long. */
export class InvalidOrderOfferError extends DomainError {
  constructor(reason: string) {
    super("orders.offer.invalid", `Le motif de la commande offerte est invalide : ${reason}.`);
  }
}

/**
 * **Une commande offerte n'impute pas de bon.** L'équipe ne dépense pas le bon
 * d'un client, et un bon imputé sur une commande ramenée à zéro serait
 * consommé pour rien.
 */
export class OfferedOrderWithVoucherError extends BusinessError {
  constructor() {
    super(
      "orders.offer.voucher",
      "Une commande offerte ne peut pas utiliser de bon de fidélité : retirez le bon, ou réglez la commande autrement.",
    );
  }
}

/**
 * **Une modification ne change pas qui paie.** Offrir une commande qui ne
 * l'était pas, ou faire payer une commande offerte, est une autre décision :
 * on annule la commande, puis on en saisit une nouvelle.
 */
export class OfferChangeOnRevisionError extends BusinessError {
  constructor(readonly wasOffered: boolean) {
    super(
      "orders.offer.revision",
      wasOffered
        ? "Cette commande est offerte : une modification ne peut pas la rendre payante. Annulez-la, puis saisissez une nouvelle commande."
        : "Une modification ne peut pas rendre une commande offerte. Annulez-la, puis saisissez une commande offerte.",
    );
  }
}
