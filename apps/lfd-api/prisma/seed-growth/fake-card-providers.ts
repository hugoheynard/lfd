import {
  InvalidProviderSignatureError,
  UnknownCardAccountError,
} from "../../src/card-payment/domain/errors/card-payment-errors.js";
import type { CardProviderEvent } from "../../src/card-payment/domain/ports/card-provider-event.js";
import type {
  CreateIntentParams,
  CreatedIntent,
  IntentCancellation,
  RefundIssuance,
  RefundLookup,
  RetrievedIntent,
} from "../../src/card-payment/domain/ports/card-provider-types.js";
import { CardProvider } from "../../src/card-payment/domain/ports/card-provider.js";
import { CardProviders } from "../../src/card-payment/domain/ports/card-providers.js";
import { PaymentAccount } from "../../src/card-payment/domain/value-objects/payment-account.js";
import { CARD_ACCOUNTS } from "../../src/platform/config/card-accounts.js";

/**
 * Prestataire de carte **factice** pour le seed : le vrai handler de commande
 * tourne (prix, journal, persistance), seule l'intention est simulée. Aucun
 * appel réseau, aucune charge réelle, aucun remboursement émis.
 */
class FakeCardProvider extends CardProvider {
  createIntent(_params: CreateIntentParams): Promise<CreatedIntent> {
    // Référence globalement unique (le champ est UNIQUE en base) : un compteur
    // remis à zéro à chaque run collisionnerait avec les commandes déjà semées.
    const providerRef = `pi_seed_${crypto.randomUUID()}`;
    return Promise.resolve({ providerRef, clientSecret: `${providerRef}_secret` });
  }

  /** L'intention telle que créée : personne ne l'a réglée, et le double n'invente pas d'encaissement. */
  retrieveIntent(providerRef: string): Promise<RetrievedIntent> {
    return Promise.resolve({
      providerRef,
      clientSecret: `${providerRef}_secret`,
      state: "awaiting_payment",
    });
  }

  /** Aucune intention réelle n'existe : l'annuler réussit toujours. */
  cancelIntent(_providerRef: string): Promise<IntentCancellation> {
    return Promise.resolve({ kind: "cancelled" });
  }

  publishableKey(): string {
    return "pk_seed";
  }

  /** Le seed ne reçoit aucun webhook : toute signature est refusée. */
  parseWebhook(): CardProviderEvent {
    throw new InvalidProviderSignatureError();
  }

  /** Rien n'a été encaissé : il ne reste rien à rendre. */
  refund(): Promise<RefundIssuance> {
    return Promise.resolve({ kind: "nothing_left" });
  }

  findRefund(): Promise<RefundLookup> {
    return Promise.resolve({ kind: "none" });
  }
}

/** Le registre doublé : chaque compte du registre, servi par le même prestataire factice. */
export class FakeCardProviders extends CardProviders {
  private readonly provider = new FakeCardProvider();

  forAccount(account: PaymentAccount): CardProvider {
    if (!CARD_ACCOUNTS.some((known) => known.name === account.name)) {
      throw new UnknownCardAccountError(account.name);
    }
    return this.provider;
  }

  accounts(): readonly PaymentAccount[] {
    return CARD_ACCOUNTS.map((known) => PaymentAccount.of(known.name));
  }
}
