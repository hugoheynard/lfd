import { VITRINE_DELIVERY_HEADER, VITRINE_SIGNATURE_HEADER } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { FieldCipher } from "../../../../platform/crypto/field-cipher.js";
import { SealedValueUnreadableError } from "../../../../platform/crypto/crypto-errors.js";
import {
  WebhookPoster,
  type WebhookPostOutcome,
} from "../../../../platform/outbound/webhook-poster.js";
import { isExhausted, nextAttemptAt } from "../../../../platform/outbox/retry-policy.js";
import { Clock } from "../../../../platform/time/clock.js";
import { signVitrineBody } from "../../domain/services/vitrine-signature.js";
import type { VitrineDelivery, VitrineDeliveryFailure } from "../../domain/vitrine-delivery.js";
import type { VitrineSubscriber } from "../../domain/vitrine-subscriber.js";

const MS_PER_SECOND = 1000;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;

/**
 * **Un essai de livraison** (W2′) : ouvre le secret, signe le corps, poste,
 * et inscrit le verdict sur la livraison — et sur l'abonné quand les essais
 * sont épuisés. Ne range rien : l'appelant range les deux, dans son unité.
 *
 * Le délai entre deux essais est celui de l'outbox (`retry-policy.ts`, la
 * même fonction, pas une copie) : dix essais, de 30 s à 6 h.
 */
@Injectable()
export class VitrineRelay {
  constructor(
    private readonly poster: WebhookPoster,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
  ) {}

  async attempt(delivery: VitrineDelivery, subscriber: VitrineSubscriber): Promise<void> {
    const outcome = await this.send(delivery, subscriber);
    const now = this.clock.now();
    if (outcome.kind === "accepted") {
      delivery.recordSuccess(outcome.status, now);
      return;
    }
    const attempts = delivery.attempts + 1;
    const retryAt = isExhausted(attempts) ? null : nextAttemptAt(attempts, now);
    delivery.recordFailure(failureOf(outcome), retryAt, now);
    if (delivery.isFailed && delivery.kind === "change") {
      subscriber.markFailed(now);
    }
  }

  private async send(
    delivery: VitrineDelivery,
    subscriber: VitrineSubscriber,
  ): Promise<WebhookPostOutcome> {
    let secret: string;
    try {
      secret = this.cipher.open(subscriber.signingSecretSealed);
    } catch (error) {
      if (error instanceof SealedValueUnreadableError) {
        return {
          kind: "refused",
          reason:
            "secret de signature illisible (la clé de chiffrement a changé) : régénérer le secret et la clé de l'abonné",
        };
      }
      throw error;
    }
    const body = JSON.stringify(delivery.notification());
    const seconds = Math.floor(this.clock.now().getTime() / MS_PER_SECOND);
    return this.poster.post({
      url: subscriber.endpointUrl,
      body,
      headers: {
        [VITRINE_SIGNATURE_HEADER]: signVitrineBody(secret, body, seconds),
        [VITRINE_DELIVERY_HEADER]: delivery.id,
      },
    });
  }
}

function failureOf(
  outcome: Exclude<WebhookPostOutcome, { kind: "accepted" }>,
): VitrineDeliveryFailure {
  switch (outcome.kind) {
    case "rejected":
      return {
        status: outcome.status,
        reason:
          outcome.status >= HTTP_REDIRECT_MIN && outcome.status <= HTTP_REDIRECT_MAX
            ? `redirection refusée (HTTP ${String(outcome.status)}) : donner l'adresse finale`
            : `l'abonné a répondu HTTP ${String(outcome.status)}`,
      };
    case "refused":
      return { status: null, reason: `envoi refusé : ${outcome.reason}` };
    case "unreachable":
      return { status: null, reason: `injoignable : ${outcome.reason}` };
  }
}
