import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Le verrou d'un avenant exige la transaction ouverte par le handler. */
export class MercurialeLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "pricing.mercuriale.lock_outside_transaction",
      "Le verrou d'une mercuriale à amender exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/** Un avenant demandé à l'écriture que l'agrégat ne porte pas — un appelant fautif. */
export class MissingAmendmentInAggregateError extends TechnicalError {
  constructor(readonly amendmentId: string) {
    super(
      "pricing.mercuriale.amendment_not_in_aggregate",
      `L'avenant ${amendmentId} n'est pas dans la mercuriale à enregistrer : il faut l'y ajouter par « amend » avant de l'écrire.`,
    );
  }
}
