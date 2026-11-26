import type { PaymentAccount } from "../value-objects/payment-account.js";

/**
 * **Le client d'une personne chez le prestataire, sur un compte** (plan
 * `documentation/payment/plan-pointage-stripe.md`, objection 2) — table
 * `payment.card_customer`. Lu chez nous, jamais cherché chez le prestataire :
 * sa recherche relit avec du retard, et deux paiements rapprochés feraient
 * deux clients.
 */
export abstract class CardCustomerReader {
  /** La référence (`cus_…`) du client de cette personne sur ce compte, ou `null`. */
  abstract find(account: PaymentAccount, userId: string): Promise<string | null>;
}
