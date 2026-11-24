import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../../platform/shared/errors/app-error.js";

/** Un essai mal formé, ou une transition qu'il n'a pas. */
export class InvalidPayLinkTestError extends DomainError {
  constructor(rule: string) {
    super("payment.pay_link_test.invalid", `Lien de paiement d'essai refusé : ${rule}.`);
  }
}

/** Le plafond du jour est atteint. */
export class PayLinkTestDailyLimitError extends BusinessError {
  constructor(limit: number) {
    super(
      "payment.pay_link_test.daily_limit",
      `${String(limit)} liens de paiement d'essai ont déjà été envoyés aujourd'hui : c'est le ` +
        "plafond du jour, chaque essai coûtant une commission. Réessayez demain, ou reprenez " +
        "un essai encore ouvert dans la liste.",
    );
  }
}

/** Aucun essai sous cet identifiant. */
export class PayLinkTestNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "payment.pay_link_test.not_found",
      `Aucun lien de paiement d'essai ne porte l'identifiant ${id}.`,
    );
  }
}

/** L'adresse d'un essai qu'on rejoue ne se compose plus : il est payé, ou sa racine manque. */
export class PayLinkTestUrlGoneError extends BusinessError {
  constructor(id: string) {
    super(
      "payment.pay_link_test.url_gone",
      `Le lien d'essai ${id} est déjà envoyé, et son adresse ne se relit plus : il est payé ` +
        "ou l'adresse publique n'est pas configurée. Ouvrez la liste des essais.",
    );
  }
}

/** Le verrou de l'envoi pris hors transaction : il tomberait aussitôt. */
export class PayLinkTestLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "payment.pay_link_test.lock_outside_transaction",
      "Le verrou de l'envoi d'un lien d'essai a été demandé hors d'une transaction : " +
        "le plafond du jour ne serait pas tenu. Faute de code, à signaler.",
    );
  }
}
