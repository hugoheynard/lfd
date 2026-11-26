import {
  AuthorizationError,
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

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

/**
 * **Offrir est un droit à part** (`b2b_offer_order`) : pouvoir saisir une
 * commande pour un client ne suffit pas.
 */
export class OfferNotPermittedError extends AuthorizationError {
  constructor() {
    super(
      "orders.offer.forbidden",
      "Vous n'avez pas le droit d'offrir une commande. Demandez à un administrateur le droit « Offrir une commande ».",
    );
  }
}

/**
 * Une passation qui offre a composé une commande sans ligne d'offre : le motif
 * n'a pas atteint l'agrégat. Rien n'est écrit.
 */
export class OfferedOrderWithoutOfferError extends TechnicalError {
  constructor() {
    super(
      "orders.offer.missing",
      "La commande offerte a été composée sans son offre : rien n'a été enregistré. Signalez-le à l'équipe technique avec l'heure de la saisie.",
    );
  }
}

/**
 * **Une commande interne ne s'offre pas à la main.** Elle naît de la passation
 * quand le payeur est un de nos restaurants, marqué « maison » à sa fiche
 * client ; la saisie « Offerte » de l'équipe ne la propose pas.
 */
export class InHouseOfferNotStaffGrantableError extends DomainError {
  constructor() {
    super(
      "orders.offer.in_house_not_grantable",
      "« Commande interne » ne se choisit pas comme motif d'offre : elle est posée d'elle-même pour un de nos restaurants. Choisissez une autre nature, ou marquez le client « maison » à sa fiche.",
    );
  }
}
