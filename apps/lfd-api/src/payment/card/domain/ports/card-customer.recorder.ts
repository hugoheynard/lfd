import type { PaymentAccount } from "../value-objects/payment-account.js";

/** Une correspondance personne → client, sur un compte. */
export interface CardCustomerLink {
  readonly account: PaymentAccount;
  readonly userId: string;
  readonly customerRef: string;
  readonly at: Date;
}

/**
 * **Garde la correspondance personne → client** d'un compte (table
 * `payment.card_customer`), port d'écriture séparé de sa lecture (ISP).
 */
export abstract class CardCustomerRecorder {
  /**
   * Écrit la correspondance si la personne n'en a pas encore sur ce compte,
   * sans lever sur une course : rend la référence qui fait foi, la sienne ou
   * celle écrite avant elle.
   */
  abstract record(link: CardCustomerLink): Promise<string>;
}
