import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un plafond des comptes du comptoir négatif ou non entier (**400**, § 3.3) :
 * c'est un montant en centimes, ou rien du tout.
 */
export class InvalidCounterAccountCeilingError extends DomainError {
  constructor(readonly ceilingCents: number) {
    super(
      "orders.counter.ceiling_invalid",
      "Le plafond des comptes ouverts au comptoir est un montant positif ou nul, en centimes. Pour n'en avoir aucun, laissez-le vide.",
    );
  }
}
