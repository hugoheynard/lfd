import { Injectable } from "@nestjs/common";

import { CustomerCancellationRefusedError } from "../../domain/errors/customer-cancellation-errors.js";
import type { CancellingPrincipal } from "../../domain/ports/cancelling-member.reader.js";
import type { CustomerCancellationSubject } from "../../domain/ports/customer-cancellation-subject.reader.js";
import { tooLatePhraseOf } from "../../domain/services/customer-cancellation-refusal.js";
import type { CustomerCancellationReason } from "../../domain/value-objects/customer-cancellation-reason.js";
import { customerErrorOf } from "./customer-cancellation-translation.js";
import { CustomerCancellationPolicyGate } from "./customer-cancellation-policy.js";
import { OrderCancellation } from "./order-cancellation.service.js";

/**
 * **Ce qui suit le mur, pour un client comme pour un invité** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.3,
 * C6.6) : P2 pour une commande personnelle quand le réglage l'impose, puis le noyau staff, appelé
 * À L'IDENTIQUE, et ses refus traduits pour un client (C6.7).
 *
 * Le mur (société, auteur, jeton) est la responsabilité de l'appelant : ce
 * service le suppose franchi.
 */
@Injectable()
export class CustomerOrderCancellation {
  constructor(
    private readonly policy: CustomerCancellationPolicyGate,
    private readonly cancellation: OrderCancellation,
  ) {}

  /**
   * @throws {CustomerCancellationRefusedError} P2, ou la règle traduite.
   * @throws {CustomerCancellationNotRecordedError} Stripe fermé, écriture ratée.
   */
  async cancel(input: {
    readonly subject: CustomerCancellationSubject;
    readonly actor: { readonly kind: "customer" | "guest"; readonly userId: string };
    readonly reason: CustomerCancellationReason;
    readonly now: Date;
    /** Le principal par lequel le client atteint la commande d'un site (§7.9). */
    readonly fromPrincipal?: CancellingPrincipal | null;
  }): Promise<void> {
    const applied = await this.policy.windowOf(input.subject, input.now);
    if (applied !== null && applied.window.kind === "too_late") {
      throw new CustomerCancellationRefusedError("too_late", tooLatePhraseOf(applied.window.until));
    }
    try {
      await this.cancellation.cancel(input.subject.orderId, {
        actor: input.actor,
        reasonText: input.reason.text,
        reasonCode: input.reason.code,
        policy: applied === null ? null : { hoursBefore: applied.hoursBefore },
        fromPrincipal: input.fromPrincipal ?? null,
      });
    } catch (error) {
      throw customerErrorOf(error, input.subject.orderId);
    }
  }
}
