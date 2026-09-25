import { PAYMENT_LINK_LABEL_MAX } from "@lfd/contracts";

import {
  InvalidPaymentLinkAmountError,
  InvalidPaymentLinkLabelError,
  PaymentLinkAboveCapError,
} from "../errors/payment-link-errors.js";

/**
 * **Ce qu'un lien demande** : un montant en centimes et le libellé que le
 * client lira sur la page Stripe.
 *
 * Séparé de l'agrégat pour une raison d'ordre, pas d'élégance : ces termes
 * doivent être validés — plafond compris — AVANT d'ouvrir une session chez
 * Stripe. Un refus après coup laisserait une session ouverte chez le
 * prestataire, payable, sans aucune ligne chez nous pour la rapprocher.
 */
export class PaymentLinkTerms {
  private constructor(
    readonly amountCents: number,
    readonly label: string,
  ) {}

  /**
   * Termes d'un lien NEUF : refuse au-delà du plafond du moment.
   *
   * @param capCents le plafond de la comptabilité, `null` = aucun.
   * @throws {InvalidPaymentLinkAmountError} montant non entier ou ≤ 0.
   * @throws {InvalidPaymentLinkLabelError} libellé vide ou trop long.
   * @throws {PaymentLinkAboveCapError} montant au-delà du plafond.
   */
  static create(amountCents: number, label: string, capCents: number | null): PaymentLinkTerms {
    const terms = PaymentLinkTerms.of(amountCents, label);
    if (capCents !== null && amountCents > capCents) {
      throw new PaymentLinkAboveCapError(amountCents, capCents);
    }
    return terms;
  }

  /**
   * Termes RELUS : sans plafond. Un lien déjà créé n'est pas touché quand le
   * plafond baisse (plan §2b) — le relire contre le plafond d'aujourd'hui le
   * rendrait illisible.
   */
  static reconstitute(amountCents: number, label: string): PaymentLinkTerms {
    return PaymentLinkTerms.of(amountCents, label);
  }

  private static of(amountCents: number, label: string): PaymentLinkTerms {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new InvalidPaymentLinkAmountError(amountCents);
    }
    const trimmed = label.trim();
    if (trimmed.length === 0 || trimmed.length > PAYMENT_LINK_LABEL_MAX) {
      throw new InvalidPaymentLinkLabelError(PAYMENT_LINK_LABEL_MAX);
    }
    return new PaymentLinkTerms(amountCents, trimmed);
  }
}
