import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un organisme public ne paie pas par carte** (409) : il règle au compte,
 * par virement sur mandat administratif. Ni la carte en ligne, ni un lien de
 * paiement.
 */
export class PublicBuyerCardRefusedError extends BusinessError {
  constructor() {
    super(
      "orders.settlement.public_buyer_card_refused",
      "Ce client est un organisme public : il ne paie pas par carte. La commande se règle au compte, par virement.",
    );
  }
}

/**
 * **Un organisme public dont le compte ne règle pas n'est jamais renvoyé à la
 * carte** (409) : son compte est suspendu ou inactif, et la carte lui est
 * interdite. La commande attend que le compte soit rétabli.
 */
export class PublicBuyerAccountUnavailableError extends BusinessError {
  constructor() {
    super(
      "orders.settlement.public_buyer_account_unavailable",
      "Ce client est un organisme public : il règle uniquement au compte, et son compte ne peut pas régler aujourd'hui (suspendu ou pas encore actif). Il ne peut pas payer par carte : rétablissez son compte depuis sa fiche client avant de passer la commande.",
    );
  }
}
