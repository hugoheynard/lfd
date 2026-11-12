import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";
import { euros } from "../services/invoice-pdf-wording.js";

/**
 * Les refus du geste **« virement reçu »** (plan
 * `le-paiement-par-virement.md`, V7). Lus par la comptabilité sans
 * le code sous les yeux : chacun nomme la facture en cause et le geste de
 * sortie. Aucun ne porte d'IBAN.
 */

/** La saisie du virement est mal formée : montant, jour, référence ou factures. */
export class InvalidBankTransferError extends DomainError {
  constructor(reason: string) {
    super(
      "accounting.bank_transfer.invalid",
      `Le virement reçu ne peut pas être saisi : ${reason}`,
    );
  }
}

/** Une facture citée n'existe pas, ou pas chez cette entité. */
export class BankTransferInvoiceNotFoundError extends ResourceNotFoundError {
  constructor(readonly invoiceId: string) {
    super(
      "accounting.bank_transfer.invoice_not_found",
      `La facture « ${invoiceId} » est introuvable chez cette entité émettrice : recharger la liste des factures à régler.`,
    );
  }
}

/** La facture ne se règle pas par virement : prélèvement, carte ou avoir. */
export class InvoiceNotPaidByTransferError extends BusinessError {
  constructor(readonly invoiceNumber: string) {
    super(
      "accounting.bank_transfer.invoice_not_by_transfer",
      `La facture ${invoiceNumber} ne se règle pas par virement (prélèvement, carte ou avoir) : la retirer du virement. Un paiement reçu autrement se saisit par « réglée autrement ».`,
    );
  }
}

/** La facture est déjà réglée par un virement reçu — un rejeu, ou une double saisie. */
export class InvoiceAlreadySettledByTransferError extends BusinessError {
  constructor(readonly invoiceNumber: string) {
    super(
      "accounting.bank_transfer.invoice_already_settled",
      `La facture ${invoiceNumber} est déjà réglée par un virement reçu : ce virement a sans doute déjà été saisi. Vérifier le relevé avant de la retirer du virement.`,
    );
  }
}

/** Les factures choisies ne sont pas toutes du même payeur, ou d'une autre entité. */
export class BankTransferMixedPayersError extends BusinessError {
  constructor(readonly invoiceNumber: string) {
    super(
      "accounting.bank_transfer.mixed_payers",
      `La facture ${invoiceNumber} n'est pas adressée au même payeur que les autres : un virement ne règle que les factures d'un seul client. Saisir un virement par client.`,
    );
  }
}

/** Le reste dû des factures choisies n'égale pas le montant reçu. */
export class BankTransferAmountMismatchError extends BusinessError {
  constructor(
    readonly amountCents: number,
    readonly invoicesCents: number,
  ) {
    const gap = amountCents - invoicesCents;
    super(
      "accounting.bank_transfer.amount_mismatch",
      `Le virement de ${euros(amountCents)} ne correspond pas aux factures choisies (${euros(invoicesCents)} restant dus) : écart de ${euros(Math.abs(gap))} ${gap > 0 ? "en trop" : "manquants"}. Ajuster les factures choisies ; un virement partiel ne se saisit pas ici.`,
    );
  }
}

/** Une commande de la facture n'est plus dans l'assiette d'encaissement. */
export class BankTransferOrderOutOfScopeError extends BusinessError {
  constructor(
    readonly invoiceNumber: string,
    readonly orderId: string,
  ) {
    super(
      "accounting.bank_transfer.order_out_of_scope",
      `Une commande de la facture ${invoiceNumber} (${orderId}) n'est plus encaissable — annulée ou hors de la mise en service du prélèvement : le signaler à l'équipe technique avant de saisir ce virement.`,
    );
  }
}
