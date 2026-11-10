import { CommandBus } from "@nestjs/cqrs";

import { RecordProviderEventCommand } from "../src/card-payment/application/commands/record-provider-event.command.js";
import {
  InvalidProviderSignatureError,
  UnknownCardAccountError,
} from "../src/card-payment/domain/errors/card-payment-errors.js";
import type { CardProviderEvent } from "../src/card-payment/domain/ports/card-provider-event.js";
import { CardProvider } from "../src/card-payment/domain/ports/card-provider.js";
import type {
  CardIntentState,
  CreateIntentParams,
  CreatedIntent,
  IntentCancellation,
  RefundIssuance,
  RefundLookup,
  RefundRemainderParams,
  RetrievedIntent,
} from "../src/card-payment/domain/ports/card-provider-types.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { PaymentAccount } from "../src/card-payment/domain/value-objects/payment-account.js";
import { assertOutsideTransaction } from "../src/platform/database/outside-transaction.js";
import type { E2eContext, E2eOverride } from "./e2e-harness.js";

/** Le seul compte du registre aujourd'hui — celui que les commandes encaissent. */
export const E2E_CARD_ACCOUNT = "lfc-stripe";

/** Un webhook signé pour le prestataire doublé : le corps et sa « signature ». */
export interface SignedCardEvent {
  readonly rawBody: Buffer;
  readonly signature: string;
}

/**
 * **Le prestataire de carte des e2e** (plan M2, §4.7 ; lot P0.c2) — un
 * `CardProvider` sans réseau, derrière le jeton `CardProviders` du bloc
 * `card-payment`, le seul que les suites doublent désormais.
 *
 * Il émet une intention DISTINCTE par passation (`<préfixe>_1`,
 * `<préfixe>_2`…) — sans quoi deux commandes partageraient une intention, et
 * le règlement de l'une solderait l'autre — et il sait SIGNER ce que son
 * `parseWebhook` accepte : un événement réduit est rangé sous une signature
 * à usage de test, que le webhook relit. Une signature inconnue est refusée,
 * comme chez le prestataire. Ses appels « réseau » posent la garde
 * `assertOutsideTransaction`, comme l'adaptateur réel : la mesure des e2e
 * (`network-measure.ts`) les voit toujours.
 */
export class E2eCardProvider extends CardProvider {
  /** Les intentions créées, dans l'ordre — la file que `settleCardPayments` vide. */
  readonly issued: string[] = [];
  /** Les intentions dont l'annulation a été demandée. */
  readonly cancelled: string[] = [];
  /** Les remboursements demandés : la référence et la clé. */
  readonly refundCalls: { readonly providerRef: string; readonly key: string }[] = [];
  /** L'état d'une intention relue ; absente = payable. */
  readonly states = new Map<string, CardIntentState>();
  /** L'issue de la prochaine annulation. */
  cancellation: IntentCancellation = { kind: "cancelled" };
  /** Les issues des prochains remboursements, dans l'ordre ; vide = `unavailable`. */
  readonly refundIssuances: RefundIssuance[] = [];
  refundLookup: RefundLookup = { kind: "none" };

  private readonly signed = new Map<string, CardProviderEvent>();
  private intents = 0;
  private events = 0;

  constructor(private readonly prefix: string) {
    super();
  }

  createIntent(_params: CreateIntentParams): Promise<CreatedIntent> {
    assertOutsideTransaction("e2e.CardProvider.createIntent");
    this.intents += 1;
    const providerRef = `${this.prefix}_${String(this.intents)}`;
    this.issued.push(providerRef);
    return Promise.resolve({ providerRef, clientSecret: `${providerRef}_secret` });
  }

  retrieveIntent(providerRef: string): Promise<RetrievedIntent> {
    assertOutsideTransaction("e2e.CardProvider.retrieveIntent");
    return Promise.resolve({
      providerRef,
      clientSecret: `${providerRef}_secret`,
      state: this.states.get(providerRef) ?? "awaiting_payment",
    });
  }

  cancelIntent(providerRef: string): Promise<IntentCancellation> {
    assertOutsideTransaction("e2e.CardProvider.cancelIntent");
    this.cancelled.push(providerRef);
    return Promise.resolve(this.cancellation);
  }

  publishableKey(): string {
    return "pk_e2e";
  }

  parseWebhook(_rawBody: Buffer, signature: string): CardProviderEvent {
    const event = this.signed.get(signature);
    if (event === undefined) {
      throw new InvalidProviderSignatureError();
    }
    return event;
  }

  refundRemainder(providerRef: string, params: RefundRemainderParams): Promise<RefundIssuance> {
    assertOutsideTransaction("e2e.CardProvider.refundRemainder");
    this.refundCalls.push({ providerRef, key: params.key });
    return Promise.resolve(
      this.refundIssuances.shift() ?? { kind: "unavailable", reason: "double e2e" },
    );
  }

  findRefund(): Promise<RefundLookup> {
    assertOutsideTransaction("e2e.CardProvider.findRefund");
    return Promise.resolve(this.refundLookup);
  }

  /** Signe un événement réduit, comme le prestataire signerait le sien. */
  sign(event: CardProviderEvent): SignedCardEvent {
    const signature = `e2e-signature:${event.eventId}`;
    this.signed.set(signature, event);
    return { rawBody: Buffer.from(event.eventId), signature };
  }

  /** Un identifiant d'événement neuf (`evt_…`) : chaque webhook est un fait distinct. */
  nextEventId(): string {
    this.events += 1;
    return `evt_${this.prefix}_${String(this.events)}`;
  }
}

/** Le registre doublé : un seul compte, `lfc-stripe`, servi par le prestataire des e2e. */
export class E2eCardProviders extends CardProviders {
  readonly provider: E2eCardProvider;

  constructor(prefix: string) {
    super();
    this.provider = new E2eCardProvider(prefix);
  }

  forAccount(account: PaymentAccount): CardProvider {
    if (account.name !== E2E_CARD_ACCOUNT) {
      throw new UnknownCardAccountError(account.name);
    }
    return this.provider;
  }

  accounts(): readonly PaymentAccount[] {
    return [PaymentAccount.of(E2E_CARD_ACCOUNT)];
  }
}

/** Le double à poser sur le jeton `CardProviders` d'une suite. */
export function cardProvidersDouble(prefix: string): E2eCardProviders {
  return new E2eCardProviders(prefix);
}

/** La même chose, sous la forme qu'attend `bootstrapE2e({ overrides })`. */
export function cardProvidersOverride(prefix: string): E2eOverride {
  return { token: CardProviders, value: cardProvidersDouble(prefix) };
}

/** Le registre doublé de l'application, ou un refus qui dit quoi poser. */
export function e2eCardProviders(ctx: E2eContext): E2eCardProviders {
  const providers = ctx.app.get(CardProviders);
  if (!(providers instanceof E2eCardProviders)) {
    throw new Error(
      "Le jeton CardProviders n'est pas doublé : poser `cardProvidersOverride(…)` " +
        "dans les overrides de la suite (plan M2, §4.7).",
    );
  }
  return providers;
}

/**
 * **Un webhook du prestataire**, par la vraie commande de `card-payment`
 * (`RecordProviderEventCommand`) : signé par le double, vérifié par lui,
 * puis traité comme en production — le canal, la ligne, les faits. On
 * draine ensuite : les abonnés partent hors de la requête.
 */
export async function recordCardEvent(
  ctx: E2eContext,
  build: (eventId: string) => CardProviderEvent,
): Promise<void> {
  const { provider } = e2eCardProviders(ctx);
  const { rawBody, signature } = provider.sign(build(provider.nextEventId()));
  await ctx.app
    .get(CommandBus)
    .execute(new RecordProviderEventCommand(E2E_CARD_ACCOUNT, rawBody, signature));
  await ctx.drain();
}

/** L'intention est encaissée (`payment_intent.succeeded`). */
export function cardPaid(ctx: E2eContext, providerRef: string): Promise<void> {
  return recordCardEvent(ctx, (eventId) => ({
    kind: "paid",
    eventId,
    eventType: "payment_intent.succeeded",
    providerRef,
  }));
}

/** L'intention est refusée par la banque (`payment_intent.payment_failed`). */
export function cardFailed(ctx: E2eContext, providerRef: string): Promise<void> {
  return recordCardEvent(ctx, (eventId) => ({
    kind: "payment_failed",
    eventId,
    eventType: "payment_intent.payment_failed",
    providerRef,
  }));
}

/**
 * **Règle les cartes**, comme le ferait le webhook : chaque intention émise
 * depuis le dernier appel est encaissée, par la vraie commande du webhook.
 *
 * Pourquoi les suites de production en ont besoin (2026-09-18, élargi le
 * 2026-09-22 par D2) : une commande dont la carte est encore `pending` n'entre
 * plus au plan du soir (`planWhere`, `production-plan.ts`) — **pro compris** :
 * qui abandonne devant sa carte ne doit rien faire fabriquer. Et son accusé de
 * réception attend le règlement (`send-order-settled-mail.handler.ts`).
 *
 * `issued` est la file que le prestataire doublé remplit à chaque intention
 * (`e2eCardProviders(ctx).provider.issued`) ; elle est vidée ici.
 */
export async function settleCardPayments(ctx: E2eContext, issued: string[]): Promise<void> {
  for (const providerRef of issued.splice(0)) {
    await cardPaid(ctx, providerRef);
  }
}
