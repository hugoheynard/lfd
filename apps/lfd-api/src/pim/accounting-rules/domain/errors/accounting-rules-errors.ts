import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le rapport prix pro / prix public est hors des bornes du possible.
 *
 * Au-dessus de 100 %, le professionnel paierait plus cher que le particulier :
 * ce n'est pas une politique commerciale, c'est une faute de frappe — et elle
 * surfacturerait TOUT le catalogue d'un coup, sans que rien à l'écran ne
 * distingue le geste voulu de l'accident.
 */
export class InvalidProPriceRatioError extends DomainError {
  constructor(readonly received: number) {
    super(
      "commerce.pro_price_ratio.invalid",
      `Rapport prix pro impossible (${String(received)}) : attendu un entier de ` +
        `points de base, > 0 et ≤ 10 000 (soit ≤ 100 %).`,
    );
  }
}

/**
 * Les règles comptables n'ont jamais été réglées.
 *
 * Une `BusinessError` et non une `DomainError` : ce n'est pas une donnée
 * invalide, c'est une décision que personne n'a encore prise. La réponse à
 * l'appelant est « allez la poser », pas « votre requête est mal formée ».
 */
export class AccountingRulesNotSetError extends BusinessError {
  constructor() {
    super(
      "commerce.accounting_rules_not_set",
      "Les règles comptables ne sont pas réglées : aucun rapport prix pro n'a été posé.",
    );
  }
}
