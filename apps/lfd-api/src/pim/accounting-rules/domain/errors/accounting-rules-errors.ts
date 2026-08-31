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

/**
 * On veut tarifer le professionnel, et personne n'a réglé le rapport.
 *
 * Refus, pas repli. Un rapport implicite à 100 % ferait facturer le prix public
 * à tous les professionnels — silencieusement, sur tout le catalogue, et la
 * nouvelle n'arriverait que par une facture contestée. C'est la même règle que
 * pour un taux de TVA absent, appliquée un cran plus haut : le référentiel a
 * déjà retiré un défaut de ce genre (`DEFAULT_FOOD_VAT_RATE`).
 *
 * Le refus vaut pour le PUSH entier et non article par article : un snapshot
 * dont tous les articles seraient écartés serait accepté par la plateforme, qui
 * retirerait alors de sa boutique tout ce qu'elle vendait. Un catalogue vidé
 * par un réglage manquant est exactement ce que ce refus empêche.
 */
export class ProPriceRatioNotSetError extends BusinessError {
  constructor() {
    super(
      "accounting_rules.pro_ratio_not_set",
      "Le rapport prix pro / prix public n'est pas réglé : impossible de tarifer les professionnels. Réglez-le dans « Règles comptables ».",
    );
  }
}
