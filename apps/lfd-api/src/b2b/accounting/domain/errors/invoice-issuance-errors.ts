import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Une mention de paiement de la facture hors de ses bornes. */
export class InvalidInvoicePaymentTermsError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("accounting.invoice_payment_terms.invalid", `${field} : ${reason}`);
  }
}

/** Un code d'unité de ligne que la facture ne connaît pas. */
export class UnknownInvoiceUnitError extends DomainError {
  constructor(readonly unknownCode: string) {
    super(
      "accounting.invoice_unit.unknown",
      `Unité de facture « ${unknownCode} » inconnue : seules la pièce (H87) et le kilogramme (KGM) ` +
        `sont admises.`,
    );
  }
}
