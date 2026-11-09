import type { CardAccountSecrets } from "../../../platform/config/card-accounts.js";
import {
  CardAccountUnavailableError,
  UnknownCardAccountError,
} from "../../domain/errors/card-payment-errors.js";
import { PaymentAccount } from "../../domain/value-objects/payment-account.js";
import { RegistryCardProviders } from "../registry-card-providers.js";
import { StripeCardProvider } from "../stripe/stripe-card-provider.js";

const SECRETS: CardAccountSecrets = {
  secretKey: "sk_test_x",
  publishableKey: "pk_test_x",
  webhookSecret: "whsec_x",
};

function registryWith(secrets: CardAccountSecrets | null): RegistryCardProviders {
  return new RegistryCardProviders({ cardAccountSecrets: () => secrets });
}

describe("RegistryCardProviders", () => {
  it("instancie un adaptateur Stripe pour `lfc-stripe` quand ses secrets sont posés", () => {
    const registry = registryWith(SECRETS);

    const provider = registry.forAccount(PaymentAccount.of("lfc-stripe"));

    expect(provider).toBeInstanceOf(StripeCardProvider);
    expect(provider.publishableKey()).toBe("pk_test_x");
    expect(registry.accounts().map((account) => account.name)).toEqual(["lfc-stripe"]);
  });

  it("sans secrets, ne l'instancie pas — et le démarrage ne tombe pas", () => {
    const registry = registryWith(null);

    expect(registry.accounts()).toEqual([]);
    expect(() => registry.forAccount(PaymentAccount.of("lfc-stripe"))).toThrow(
      CardAccountUnavailableError,
    );
  });

  it("un compte absent du registre est inconnu (400), même avec des secrets", () => {
    expect(() => registryWith(SECRETS).forAccount(PaymentAccount.of("lfc-autre"))).toThrow(
      UnknownCardAccountError,
    );
  });
});
