import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un organisme public règle **au compte**, toujours (409) : retirer son crédit
 * le renverrait à la carte, qu'un organisme public ne peut pas utiliser
 * (mandat administratif, virement).
 */
export class PublicPayerTermsRequiredError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.public_payer.terms_required",
      "Ce client est un organisme public : il règle toujours au compte, par virement. Le règlement au compte ne peut pas lui être retiré.",
    );
  }
}

/**
 * Le prélèvement d'un organisme public ne se bloque pas (409) : il n'est
 * jamais prélevé, et un blocage le renverrait à la carte.
 */
export class PublicPayerDirectDebitBlockRefusedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.public_payer.direct_debit_block_refused",
      "Ce client est un organisme public : il n'est jamais prélevé, il règle par virement. Il n'y a pas de prélèvement à bloquer ; pour suspendre ses commandes, suspendez son compte.",
    );
  }
}
