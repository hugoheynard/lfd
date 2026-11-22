import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un virement que la règle du bloc refuse. L'appelant juge en premier avec
 * ses propres mots (la facture, le payeur) : ce refus ne paraît que si son
 * jugement et celui du bloc ont divergé — une faute de code, pas de saisie.
 */
export class InvalidReceivedTransferError extends DomainError {
  constructor(transferId: string, rule: string) {
    super(
      "payment.transfer.invalid",
      `Virement reçu ${transferId} refusé par le bloc de paiement : ${rule}. ` +
        "Rien n'a été enregistré ; signaler la saisie à l'équipe technique.",
    );
  }
}

/** Un sujet qu'un virement règle déjà : la base tient l'unicité du couple (type, id). */
export class SubjectAlreadySettledByTransferError extends BusinessError {
  constructor(transferId: string) {
    super(
      "payment.transfer.subject_already_settled",
      `Virement reçu ${transferId} refusé : une des pièces citées est déjà réglée par un autre ` +
        "virement. Recharger la liste des factures à régler, puis ressaisir.",
    );
  }
}
