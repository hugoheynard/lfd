import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/** Un avoir n'a pas d'e-mail « Votre facture » (Q3 ne prévient qu'à la facture). */
export class InvoiceNoticeNotForCreditNoteError extends BusinessError {
  constructor(readonly number: string) {
    super(
      "accounting.invoice.notice_not_for_credit_note",
      `${number} est un avoir : aucun e-mail « Votre facture » ne part pour un avoir. Le client le voit dans « Mes factures ».`,
    );
  }
}

/** Le renvoi n'a personne à prévenir : rien n'est parti. */
export class InvoiceNoticeNobodyToNotifyError extends BusinessError {
  constructor(readonly number: string) {
    super(
      "accounting.invoice.notice_nobody",
      `Renvoi de ${number} impossible : le payeur n'a ni contact de facturation ni détenteur joignable, et aucun site de la facture n'a de rôle facturation. Renseigner un contact de facturation sur la fiche du payeur, puis renvoyer.`,
    );
  }
}

/** Le fournisseur a refusé au moins un envoi du renvoi ; le refus est au journal. */
export class InvoiceNoticeResendRefusedError extends BusinessError {
  constructor(
    readonly number: string,
    readonly failure: string,
  ) {
    super(
      "accounting.invoice.notice_resend_refused",
      `Renvoi de ${number} refusé par le fournisseur d'e-mail (${failure}). Une adresse en rebond dur reste bloquée chez Resend : corriger le contact de facturation, ou la retirer de la liste de suppression, puis renvoyer.`,
    );
  }
}
