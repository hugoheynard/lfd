import { Injectable } from "@nestjs/common";

import { CardAccountDefaults } from "../../platform/config/card-accounts.js";
import { NoCardAccountForSubjectTypeError } from "../domain/errors/card-payment-errors.js";
import type { CardProvider } from "../domain/ports/card-provider.js";
import { CardProviders } from "../domain/ports/card-providers.js";
import { PaymentAccount } from "../domain/value-objects/payment-account.js";

/** Le compte qui encaisse un type de sujet, et son prestataire. */
export interface ChosenCardAccount {
  readonly account: PaymentAccount;
  readonly provider: CardProvider;
}

/**
 * **Choisit le compte d'un type de sujet** (plan M2, §3.2) : la valeur
 * `default_for` posée par la racine de composition, puis le prestataire de ce
 * compte. Partagé par la préparation d'une intention et la clé publique : un
 * appelant ne nomme jamais un compte.
 */
@Injectable()
export class CardAccountChoice {
  constructor(
    private readonly defaults: CardAccountDefaults,
    private readonly providers: CardProviders,
  ) {}

  /**
   * @throws {NoCardAccountForSubjectTypeError} aucun compte pour ce type.
   * @throws {CardAccountUnavailableError} compte non configuré.
   */
  forSubjectType(subjectType: string): ChosenCardAccount {
    const name = this.defaults.accountFor(subjectType);
    if (name === null) {
      throw new NoCardAccountForSubjectTypeError(subjectType);
    }
    const account = PaymentAccount.of(name);
    return { account, provider: this.providers.forAccount(account) };
  }
}
