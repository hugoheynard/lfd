import { Inject, Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import {
  CARD_ACCOUNTS,
  type CardAccountSecrets,
  type CardProviderType,
  declaredCardAccount,
} from "../../platform/config/card-accounts.js";
import {
  CardAccountUnavailableError,
  UnknownCardAccountError,
} from "../domain/errors/card-payment-errors.js";
import type { CardProvider } from "../domain/ports/card-provider.js";
import { CardProviders } from "../domain/ports/card-providers.js";
import { PaymentAccount } from "../domain/value-objects/payment-account.js";
import { StripeCardProvider } from "./stripe/stripe-card-provider.js";

/**
 * **Un adaptateur par TYPE de prestataire** — un type de plus est une ligne
 * de plus, pas une branche (OCP). `lyra` viendra avec `lfc-caisse-epargne`.
 */
const ADAPTERS: Readonly<Record<CardProviderType, (secrets: CardAccountSecrets) => CardProvider>> =
  {
    stripe: (secrets) => new StripeCardProvider(secrets),
  };

/**
 * **Les prestataires des comptes du registre** (plan M2, §3.2) : un
 * adaptateur par compte dont les trois secrets sont posés.
 *
 * 🔴 Un compte sans secrets n'est PAS instancié, et c'est journalisé au
 * démarrage — la production ne tombe pas pour un compte annoncé avant
 * d'être configuré. Le demander rend alors
 * `CardAccountUnavailableError`.
 */
@Injectable()
export class RegistryCardProviders extends CardProviders {
  private readonly logger = new Logger(RegistryCardProviders.name);
  private readonly byAccount: ReadonlyMap<string, CardProvider>;

  constructor(@Inject(AppConfig) config: Pick<AppConfig, "cardAccountSecrets">) {
    super();
    const byAccount = new Map<string, CardProvider>();
    for (const declared of CARD_ACCOUNTS) {
      const secrets = config.cardAccountSecrets(declared.name);
      if (secrets === null) {
        this.logger.warn(
          `Compte d'encaissement « ${declared.name} » non instancié : ` +
            `${declared.env.secretKey}, ${declared.env.publishableKey} et ` +
            `${declared.env.webhookSecret} vont ensemble, et l'un manque.`,
        );
        continue;
      }
      byAccount.set(declared.name, ADAPTERS[declared.provider](secrets));
    }
    this.byAccount = byAccount;
  }

  forAccount(account: PaymentAccount): CardProvider {
    if (declaredCardAccount(account.name) === null) {
      throw new UnknownCardAccountError(account.name);
    }
    const provider = this.byAccount.get(account.name);
    if (provider === undefined) {
      throw new CardAccountUnavailableError(account.name);
    }
    return provider;
  }

  accounts(): readonly PaymentAccount[] {
    return [...this.byAccount.keys()].map((name) => PaymentAccount.of(name));
  }
}
