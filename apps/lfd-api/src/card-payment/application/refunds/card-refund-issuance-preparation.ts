import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import type { RefundParams } from "../../domain/ports/card-provider-types.js";
import type { CardRefundRequest } from "../../domain/entities/card-refund-request.js";
import { CardRefundRequestRepository } from "../../domain/ports/card-refund-request.repository.js";
import { amountInProgress } from "../../domain/services/refund-siblings.js";
import { CardRefundEffectsWriter, RefundEffects } from "./card-refund-effects.js";
import { stoppedFact } from "./card-refund-journal.js";
import { CardRefundScope, type LockedPayment } from "./card-refund-scope.js";

/** Le motif écrit quand le paiement n'a pas de référence chez le prestataire. */
const NO_INTENT = "no_intent";

/** Un appel au prestataire, préparé sous verrou : le compte et la référence lus sur la ligne. */
export interface RefundCall {
  readonly paymentId: string;
  readonly account: string;
  readonly providerRef: string;
  readonly params: RefundParams;
}

/**
 * **Le premier temps de l'exécuteur** (plan M2, §3.5, §3.6) : sous
 * `lockSubject` puis le verrou du paiement, la demande relue sous son bail.
 * Rend l'appel à faire, ou `null` quand il n'y a rien à appeler — le bail est
 * alors relâché :
 *
 * - la demande n'est plus à émettre (le constat l'a précédée) ;
 * - une `remainder` dont le paiement n'a plus de reste : `refunded` (§6.2) ;
 * - une `remainder` quand une `amount` du paiement est en cours : elle attend
 *   son tour, le balayage la reprendra (§3.5) ;
 * - pas de référence chez le prestataire : arrêtée, cloche.
 */
@Injectable()
export class CardRefundIssuancePreparation {
  constructor(
    private readonly scope: CardRefundScope,
    private readonly requests: CardRefundRequestRepository,
    private readonly effects: CardRefundEffectsWriter,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  prepare(requestId: string, token: string): Promise<RefundCall | null> {
    return this.uow.run(async () => {
      const paymentId = await this.requests.paymentOf(requestId);
      const locked = paymentId === null ? null : await this.scope.lock(paymentId);
      const request = locked === null ? null : await this.requests.load(requestId);
      if (locked === null || request === null || !request.isHeldBy(token)) {
        return null;
      }
      const effects = new RefundEffects();
      const call = await this.decide(locked, request, effects);
      if (call === null) {
        request.release();
        await this.requests.save(request);
        await this.effects.flush(locked, effects);
      }
      return call;
    });
  }

  private async decide(
    locked: LockedPayment,
    request: CardRefundRequest,
    effects: RefundEffects,
  ): Promise<RefundCall | null> {
    const { ledger, subject } = locked;
    if (request.current !== "to_issue") {
      return null;
    }
    if (request.view.form === "remainder") {
      if (ledger.remainderCents() <= 0) {
        request.settleWithoutRemainder();
        return null;
      }
      if (amountInProgress(await this.requests.ofPayment(ledger.paymentId))) {
        return null;
      }
    }
    if (ledger.paymentRef === null) {
      this.stopWithoutIntent(request, effects);
      return null;
    }
    return {
      paymentId: ledger.paymentId,
      account: ledger.account,
      providerRef: ledger.paymentRef,
      params: {
        key: request.key(),
        requestId: request.id,
        generation: request.generation,
        subjectLabel: `${subject.type}:${subject.id}`,
        amountCents: request.view.amountCents,
      },
    };
  }

  /** Impossible sur un paiement rattaché (sa référence est obligatoire) ; tracé plutôt que tu. */
  private stopWithoutIntent(request: CardRefundRequest, effects: RefundEffects): void {
    request.stop(NO_INTENT, this.clock.now());
    effects.journal((label) => stoppedFact(request, label));
    effects.ring(request, "no_intent");
    effects.outcome({
      kind: "attempted",
      requestId: request.id,
      generation: request.generation,
      failure: NO_INTENT,
      providerRef: null,
    });
  }
}
