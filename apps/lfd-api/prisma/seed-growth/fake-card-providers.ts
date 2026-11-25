import {
  InvalidProviderSignatureError,
  UnknownCardAccountError,
} from "../../src/payment/card/domain/errors/card-payment-errors.js";
import type { CardProviderEvent } from "../../src/payment/card/domain/ports/card-provider-event.js";
import type {
  CreateIntentParams,
  CreatedIntent,
  IntentCancellation,
  RefundIssuance,
  RefundLookup,
  RetrievedIntent,
} from "../../src/payment/card/domain/ports/card-provider-types.js";
import { CardProvider } from "../../src/payment/card/domain/ports/card-provider.js";
import { CardProviders } from "../../src/payment/card/domain/ports/card-providers.js";
import { PaymentAccount } from "../../src/payment/card/domain/value-objects/payment-account.js";
import { CARD_ACCOUNTS } from "../../src/platform/config/card-accounts.js";
import { PROVIDER_CHECK_HORIZON_MS } from "../../src/payment/card/domain/services/provider-check-schedule.js";
import type { PrismaService } from "../../src/platform/database/prisma.service.js";

/** Le préfixe des intentions que ce prestataire invente. */
const SEED_INTENT_PREFIX = "pi_seed_";

/**
 * Prestataire de carte **factice** pour le seed : le vrai handler de commande
 * tourne (prix, journal, persistance), seule l'intention est simulée. Aucun
 * appel réseau, aucune charge réelle, aucun remboursement émis.
 */
class FakeCardProvider extends CardProvider {
  createIntent(_params: CreateIntentParams): Promise<CreatedIntent> {
    // Référence globalement unique (le champ est UNIQUE en base) : un compteur
    // remis à zéro à chaque run collisionnerait avec les commandes déjà semées.
    const providerRef = `${SEED_INTENT_PREFIX}${crypto.randomUUID()}`;
    return Promise.resolve({
      providerRef,
      collection: {
        kind: "embedded",
        provider: "stripe",
        publishableKey: this.publishableKey(),
        token: `${providerRef}_secret`,
      },
    });
  }

  /** L'intention telle que créée : personne ne l'a réglée, et le double n'invente pas d'encaissement. */
  retrieveIntent(providerRef: string): Promise<RetrievedIntent> {
    return Promise.resolve({
      providerRef,
      collection: {
        kind: "embedded",
        provider: "stripe",
        publishableKey: this.publishableKey(),
        token: `${providerRef}_secret`,
      },
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

/**
 * **Retire du balayage les intentions inventées par le semis.**
 *
 * L'API de dev parle au vrai Stripe (mode test), qui ne connaît aucune
 * `pi_seed_…` : sans ce geste, chaque paiement semé encore en attente lui
 * serait redemandé pendant tout l'horizon de relecture, et chaque relecture
 * journaliserait une erreur. On les marque relus jusqu'au-delà de cet horizon,
 * date à laquelle le balayage ne les sélectionne plus de toute façon. Rien
 * n'est encaissé ni annulé : la commande reste en attente de paiement, comme
 * le scénario la veut. Rendue : le nombre de paiements écartés.
 */
export async function parkSeededIntents(prisma: PrismaService, now: Date): Promise<number> {
  const { count } = await prisma.cardPayment.updateMany({
    where: {
      providerRef: { startsWith: SEED_INTENT_PREFIX },
      state: { in: ["pending", "failed"] },
    },
    data: { providerCheckedAt: new Date(now.getTime() + PROVIDER_CHECK_HORIZON_MS) },
  });
  return count;
}
