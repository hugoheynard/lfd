import type { CardSubject } from "../subjects/index.js";
import type { CardPaymentLabel } from "./card-payments.js";

/**
 * Le libellé définitif d'une intention : la description et les clés de
 * l'appelant, sans payeur — le client du prestataire est posé à la création
 * (doc `documentation/payment/le-pointage-stripe.md`, § 2).
 */
export type CardPaymentDescription = Pick<CardPaymentLabel, "description" | "metadata">;

/**
 * **Redire une intention chez le prestataire, une fois le sujet enregistré**
 * (doc `documentation/payment/le-pointage-stripe.md`, § 3) — déclaré ET
 * implémenté par `payment`, appelé par l'abonné durable du sujet. À part de
 * `CardPayments` : celui qui redit un libellé n'encaisse pas (ISP).
 *
 * Le libellé est composé par l'appelant et reste opaque pour le bloc (D2).
 */
export abstract class CardPaymentLabels {
  /**
   * Garde le libellé du paiement de cette intention, DANS la transaction de
   * l'appelant, et le pose chez le prestataire après validation — repris par
   * le balayage tant qu'il n'y est pas, dans une limite d'essais. Sans effet
   * si l'intention n'est pas un paiement de ce sujet, ou si le même libellé
   * est déjà gardé. Jamais un appel réseau ici ; jamais le paiement touché.
   *
   * @throws {InvalidCardPaymentLabelError} une clé réservée, mal formée, ou trop de clés.
   */
  abstract describe(
    subject: CardSubject,
    providerRef: string,
    label: CardPaymentDescription,
  ): Promise<void>;
}
