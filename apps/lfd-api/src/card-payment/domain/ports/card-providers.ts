import type { PaymentAccount } from "../value-objects/payment-account.js";
import type { CardProvider } from "./card-provider.js";

/**
 * **Un prestataire par compte d'encaissement** (plan M2, §3.2) — instancié
 * depuis le registre (`platform/config/card-accounts.ts`) et les secrets de
 * chaque compte. C'est CE jeton que les e2e doublent (§4.7).
 */
export abstract class CardProviders {
  /**
   * Le prestataire du compte.
   * @throws {UnknownCardAccountError} le registre ne connaît pas ce compte (400).
   * @throws {CardAccountUnavailableError} connu, mais ses secrets manquent (500).
   */
  abstract forAccount(account: PaymentAccount): CardProvider;

  /** Les comptes instanciés — ceux dont les trois secrets sont posés. */
  abstract accounts(): readonly PaymentAccount[];
}
