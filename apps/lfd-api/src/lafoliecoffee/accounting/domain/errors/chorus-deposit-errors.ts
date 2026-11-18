import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **dépôt sur Chorus Pro** (plan `plan-clients-publics-chorus.md`,
 * § 6 quinquies). Lus par la comptabilité sans le code sous les yeux : chacun
 * nomme la facture et le geste de sortie.
 */

/** La saisie est mal formée : un jour illisible, un motif vide ou trop long. */
export class InvalidChorusDepositError extends DomainError {
  constructor(invoiceNumber: string, reason: string) {
    super(
      "accounting.chorus_deposit.invalid",
      `Le dépôt Chorus de la facture ${invoiceNumber} ne peut pas être noté : ${reason}`,
    );
  }
}

/** La facture n'existe pas. */
export class ChorusDepositInvoiceNotFoundError extends ResourceNotFoundError {
  constructor(invoiceId: string) {
    super(
      "accounting.chorus_deposit.invoice_not_found",
      `La facture « ${invoiceId} » est introuvable : recharger la liste « À déposer sur Chorus ».`,
    );
  }
}

/** Un avoir, ou une facture d'un client qui n'est pas un organisme public. */
export class InvoiceNotForChorusError extends BusinessError {
  constructor(invoiceNumber: string) {
    super(
      "accounting.chorus_deposit.not_public",
      `La pièce ${invoiceNumber} n'est pas une facture d'organisme public : elle ne se dépose pas sur Chorus Pro. Seules les factures dont le client a une forme juridique publique y vont.`,
    );
  }
}

/** La facture est annulée par un avoir : on ne la dépose plus. */
export class CreditedInvoiceNotForChorusError extends BusinessError {
  constructor(invoiceNumber: string) {
    super(
      "accounting.chorus_deposit.credited",
      `La facture ${invoiceNumber} est annulée par un avoir : elle ne se dépose pas sur Chorus Pro. Si elle y est déjà, notez son rejet ou traitez l'écart à la main.`,
    );
  }
}

/** Déjà déposée : une facture ne se dépose qu'une fois, même rejetée. */
export class ChorusAlreadyDepositedError extends BusinessError {
  constructor(invoiceNumber: string, depositedOn: string) {
    super(
      "accounting.chorus_deposit.already_deposited",
      `La facture ${invoiceNumber} est déjà notée déposée sur Chorus le ${depositedOn}. Une facture rejetée ne se redépose pas : la comptabilité fait l'avoir et une nouvelle facture, à la main.`,
    );
  }
}

/** Rejet ou mise en paiement d'une facture qui n'est pas déposée. */
export class ChorusNotDepositedError extends BusinessError {
  constructor(invoiceNumber: string) {
    super(
      "accounting.chorus_deposit.not_deposited",
      `La facture ${invoiceNumber} n'est pas notée déposée sur Chorus : notez d'abord « Déposée le … ».`,
    );
  }
}

/** Déjà rejetée ou déjà mise en paiement : l'issue de Chorus est connue. */
export class ChorusOutcomeKnownError extends BusinessError {
  constructor(invoiceNumber: string, outcome: "rejected" | "accepted", on: string) {
    super(
      "accounting.chorus_deposit.outcome_known",
      `La facture ${invoiceNumber} est déjà notée ${outcome === "rejected" ? "rejetée par Chorus" : "mise en paiement"} le ${on} : rien de plus à noter.`,
    );
  }
}

/** Un jour hors de la fenêtre : avant la facture (ou le dépôt), ou dans le futur. */
export class ChorusDayOutOfRangeError extends DomainError {
  constructor(invoiceNumber: string, day: string, earliest: string, today: string) {
    super(
      "accounting.chorus_deposit.day_out_of_range",
      `Le ${day} ne convient pas pour la facture ${invoiceNumber} : saisir un jour entre le ${earliest} et aujourd'hui (${today}).`,
    );
  }
}

/** Une facture listée pour Chorus n'a pas d'échéance lisible : la ligne est corrompue. */
export class ChorusInvoiceUnreadableError extends TechnicalError {
  constructor(invoiceNumber: string) {
    super(
      "accounting.chorus_deposit.unreadable",
      `La facture ${invoiceNumber} est listée pour Chorus sans délai de paiement lisible : signaler à l'équipe technique.`,
    );
  }
}
