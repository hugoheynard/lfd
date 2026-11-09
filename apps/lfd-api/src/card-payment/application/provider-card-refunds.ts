import { Injectable } from "@nestjs/common";

import { AppError } from "../../platform/shared/errors/app-error.js";
import { CardProviderRefunds } from "../channels/requests/card-provider-refunds.js";
import type {
  RefundIssuance,
  RefundLookup,
  RefundRemainderParams,
} from "../domain/ports/card-provider-types.js";
import type { CardProvider } from "../domain/ports/card-provider.js";
import { CardProviders } from "../domain/ports/card-providers.js";
import { PaymentAccount } from "../domain/value-objects/payment-account.js";

/**
 * **`CardProviderRefunds`, implémenté par le bloc** — transitoire (plan M2,
 * §4.2 ; retiré en P1). Le prestataire DU COMPTE de la ligne : un compte
 * inconnu ou non configuré n'est pas une exception, c'est un `unavailable`,
 * comme un canal non configuré l'était pour `StripePaymentRefunder`.
 */
@Injectable()
export class ProviderCardRefunds extends CardProviderRefunds {
  constructor(private readonly providers: CardProviders) {
    super();
  }

  refundRemainder(
    account: string,
    providerRef: string,
    params: RefundRemainderParams,
  ): Promise<RefundIssuance> {
    const provider = this.providerOf(account);
    return provider.kind === "unavailable"
      ? Promise.resolve(provider)
      : provider.provider.refundRemainder(providerRef, params);
  }

  findRefund(
    account: string,
    providerRef: string,
    params: RefundRemainderParams,
  ): Promise<RefundLookup> {
    const provider = this.providerOf(account);
    return provider.kind === "unavailable"
      ? Promise.resolve(provider)
      : provider.provider.findRefund(providerRef, params);
  }

  private providerOf(
    account: string,
  ):
    | { readonly kind: "found"; readonly provider: CardProvider }
    | { readonly kind: "unavailable"; readonly reason: string } {
    try {
      return { kind: "found", provider: this.providers.forAccount(PaymentAccount.of(account)) };
    } catch (error) {
      if (error instanceof AppError) {
        return { kind: "unavailable", reason: error.message };
      }
      throw error;
    }
  }
}
