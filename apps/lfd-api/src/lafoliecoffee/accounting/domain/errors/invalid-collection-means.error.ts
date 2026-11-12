import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un moyen d'encaissement qui n'est ni le prélèvement ni le virement. À part
 * des autres refus du moyen : la valeur qu'il garde l'importe, eux importent
 * ses libellés.
 */
export class InvalidCollectionMeansError extends DomainError {
  constructor(readonly raw: string) {
    super(
      "accounting.collection_means.invalid",
      `Moyen d'encaissement « ${raw} » inconnu : attendu prélèvement SEPA (sepa_debit) ou ` +
        `virement bancaire (bank_transfer).`,
    );
  }
}
