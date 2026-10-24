import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un plafond de la banque mal formé : non entier, ou nul ou négatif.
 *
 * Le message nomme le plafond et dit le geste : saisir un montant positif,
 * ou laisser vide quand la convention ne le fixe pas.
 */
export class InvalidBankCollectionLimitError extends DomainError {
  constructor(
    readonly field: string,
    readonly received: number,
  ) {
    super(
      "accounting.bank_collection_limits.invalid",
      `${field} : ${received} n'est pas un montant accepté — saisissez un montant positif ` +
        `en centimes entiers, ou laissez le champ vide si la convention de la banque ne fixe ` +
        `pas ce plafond`,
    );
  }
}
