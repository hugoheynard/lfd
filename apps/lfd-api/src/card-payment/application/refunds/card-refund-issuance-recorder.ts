import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { nextAttemptAt } from "../../../platform/outbox/retry-policy.js";
import { Clock } from "../../../platform/time/clock.js";
import { WallClock } from "../../../platform/time/wall-clock.js";
import type { RefundAttemptedOutcome } from "../../channels/subjects/index.js";
import type { CardRefundRequest } from "../../domain/entities/card-refund-request.js";
import { CardRefundRejectedError } from "../../domain/errors/card-refund-errors.js";
import type { IssuedRefund, RefundIssuance } from "../../domain/ports/card-provider-types.js";
import { CardRefundLedgerRepository } from "../../domain/ports/card-refund-ledger.repository.js";
import { CardRefundRequestRepository } from "../../domain/ports/card-refund-request.repository.js";
import type { CardRefundAttentionCause } from "./card-refund-bell.js";
import { lineOutcome, rejectedOutcome } from "./card-refund-drafts.js";
import { CardRefundEffectsWriter, RefundEffects } from "./card-refund-effects.js";
import { attemptFailedFact, issuedFact, stoppedFact } from "./card-refund-journal.js";
import { CardRefundScope, type LockedPayment } from "./card-refund-scope.js";

/** Ce que l'exécuteur a obtenu du prestataire, avec la génération qu'il visait. */
export interface IssuanceAttempt {
  readonly requestId: string;
  readonly paymentId: string;
  readonly token: string;
  readonly generation: number;
  readonly issuance: RefundIssuance;
}

/** La demande chargée, et — si le bail et la génération sont encore les nôtres — celle qu'on écrit. */
interface Held {
  readonly locked: LockedPayment;
  readonly loaded: CardRefundRequest;
  readonly request: CardRefundRequest | null;
  readonly effects: RefundEffects;
}

type Applying<K extends RefundIssuance["kind"]> = (
  held: Held,
  issuance: Extract<RefundIssuance, { kind: K }>,
) => void;

/** Ce que l'arrêt d'une émission sonne, selon son code. */
function causeOfStop(failure: string): CardRefundAttentionCause {
  return failure === "issued_amount_mismatch" ? "amount_mismatch" : "failed";
}

/**
 * **Le troisième temps de l'exécuteur** (plan M2, §3.5, §3.6) : l'issue de
 * l'appel au prestataire, écrite dans une transaction courte, dans l'ordre
 * unique — `lockSubject`, le paiement et son carnet, la demande RELUE ; puis
 * les lignes ; puis le journal, les cloches et le canal (`attempted`,
 * `issued`, et l'issue de la ligne au carnet).
 *
 * Si le jeton n'est plus le nôtre ou si la génération a changé, rien n'est
 * écrit de la demande — le constat au carnet, lui, est fait : il est
 * idempotent. Aucune issue ne lève ; chacune laisse sa trace.
 */
@Injectable()
export class CardRefundIssuanceRecorder {
  private readonly applying: { readonly [K in RefundIssuance["kind"]]: Applying<K> } = {
    issued: (held, issuance) => this.issued(held, issuance.refund),
    nothing_left: (held) => this.nothingLeft(held),
    declined: (held, issuance) => this.stop(held, `declined:${issuance.code}`, "declined"),
    unavailable: (held) => this.unavailable(held),
  };

  constructor(
    private readonly scope: CardRefundScope,
    private readonly requests: CardRefundRequestRepository,
    private readonly ledgers: CardRefundLedgerRepository,
    private readonly effects: CardRefundEffectsWriter,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly wall: WallClock,
    private readonly uow: UnitOfWork,
  ) {}

  record(attempt: IssuanceAttempt): Promise<void> {
    return this.uow.run(async () => {
      const locked = await this.scope.lock(attempt.paymentId);
      const loaded = locked === null ? null : await this.requests.load(attempt.requestId);
      if (locked === null || loaded === null) {
        return;
      }
      const ours = loaded.isHeldBy(attempt.token) && loaded.generation === attempt.generation;
      const held: Held = {
        locked,
        loaded,
        request: ours ? loaded : null,
        effects: new RefundEffects(),
      };
      this.apply(held, attempt.issuance);
      await this.ledgers.save(locked.ledger);
      if (held.request !== null) {
        held.request.release();
        await this.requests.save(held.request);
      }
      await this.effects.flush(locked, held.effects);
    });
  }

  private apply<K extends RefundIssuance["kind"]>(
    held: Held,
    issuance: Extract<RefundIssuance, { kind: K }>,
  ): void {
    const applying = this.applying[issuance.kind] as Applying<K>;
    applying(held, issuance);
  }

  /** Exactement ce que fait le constat : le carnet, puis le `re_…` posé sur la demande. */
  private issued(held: Held, refund: IssuedRefund): void {
    const { locked, loaded, request, effects } = held;
    const report = {
      providerRef: refund.refundId,
      amountCents: refund.amountCents,
      currency: refund.currency,
      status: refund.status,
      refundedAt: refund.createdAt,
    };
    const now = this.clock.now();
    try {
      const recording = locked.ledger.record(
        report,
        { requestId: loaded.id, nature: loaded.view.nature },
        this.ids.next(),
        now,
      );
      if (recording.kind === "recorded") {
        effects.outcome(lineOutcome(recording.line, recording.before));
      }
    } catch (error) {
      if (!(error instanceof CardRefundRejectedError)) {
        throw error;
      }
      // Le sujet le journalise et sonne (une cloche par incident) ; la
      // demande s'arrête — rejouer rendrait le même refus.
      effects.outcome(rejectedOutcome(report, error.reason, loaded.id));
      if (request !== null) {
        this.stopQuietly(held, request, `rejected:${error.reason}`);
      }
      return;
    }
    if (request !== null) {
      this.accept(held, request, refund, now);
    }
  }

  private accept(held: Held, request: CardRefundRequest, refund: IssuedRefund, now: Date): void {
    const effect = request.acceptIssuance(
      refund.refundId,
      refund.amountCents,
      refund.status,
      now,
      now,
    );
    if (!effect.changed) {
      return;
    }
    const { effects } = held;
    effects.journal((label) => issuedFact(request, label));
    effects.outcome({
      kind: "issued",
      requestId: request.id,
      generation: request.generation,
      providerRef: refund.refundId,
      announcedCents: request.view.announcedCents,
      issuedCents: refund.amountCents,
    });
    if (effect.stopped !== null) {
      effects.journal((label) => stoppedFact(request, label));
      effects.ring(request, causeOfStop(effect.stopped));
    }
  }

  /**
   * « Tout est déjà rendu » (§3.5) : sans reste, une `remainder` est rendue ;
   * un reste couvert par un `re_…` en vol de CETTE demande, elle est émise sur
   * lui ; sinon (un remboursement manuel, une `amount`) elle s'arrête.
   */
  private nothingLeft(held: Held): void {
    const { locked, request } = held;
    if (request === null) {
      return;
    }
    if (request.view.form === "remainder" && locked.ledger.remainderCents() <= 0) {
      request.settleWithoutRemainder();
      return;
    }
    const covering = locked.ledger
      .inFlightLines()
      .find((line) => line.requestId === request.id && line.providerRef !== null);
    const coveringRef = covering?.providerRef ?? null;
    if (request.view.form === "remainder" && covering !== undefined && coveringRef !== null) {
      const now = this.clock.now();
      request.acceptIssuance(coveringRef, covering.amountCents, covering.status, now, now);
      return;
    }
    this.stop(held, "nothing_left", "nothing_left");
  }

  /** Rejouer ne changerait rien : arrêtée, tracée, sonnée. */
  private stop(held: Held, failure: string, cause: CardRefundAttentionCause): void {
    if (held.request === null) {
      return;
    }
    this.stopQuietly(held, held.request, failure);
    held.effects.ring(held.request, cause);
  }

  private stopQuietly(held: Held, request: CardRefundRequest, failure: string): void {
    request.stop(failure, this.clock.now());
    held.effects.journal((label) => stoppedFact(request, label));
    held.effects.outcome(attempted(request, failure));
  }

  /** Le prestataire n'a pas répondu : un round de plus, la reprise sur la courbe de la boîte d'envoi. */
  private unavailable(held: Held): void {
    const { request, effects } = held;
    if (request === null) {
      return;
    }
    const retryAt = nextAttemptAt(request.view.attempts + 1, this.wall.elapsedNow());
    const first = request.unavailable(this.clock.now(), retryAt);
    effects.journal((label) => attemptFailedFact(request, label));
    effects.outcome(attempted(request, "unavailable"));
    if (first) {
      effects.ring(request, "unavailable");
    }
  }
}

function attempted(
  request: CardRefundRequest,
  failure: string,
): Omit<RefundAttemptedOutcome, "position"> {
  return {
    kind: "attempted",
    requestId: request.id,
    generation: request.generation,
    failure,
    providerRef: request.view.providerRef,
  };
}
