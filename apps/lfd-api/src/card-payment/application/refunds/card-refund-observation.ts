import { Injectable, Logger } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { CardRefunds } from "../../channels/requests/card-refunds.js";
import type {
  CardRefundReport,
  CardRefundRecording,
} from "../../domain/entities/card-refund-ledger.js";
import type { CardRefundRequest } from "../../domain/entities/card-refund-request.js";
import { CardRefundRejectedError } from "../../domain/errors/card-refund-errors.js";
import type { RefundEvent } from "../../domain/ports/card-provider-event.js";
import { CardRefundLedgerRepository } from "../../domain/ports/card-refund-ledger.repository.js";
import { CardRefundRequestRepository } from "../../domain/ports/card-refund-request.repository.js";
import type { PaymentAccount } from "../../domain/value-objects/payment-account.js";
import { ProviderPaymentResolver } from "../provider-payment-resolver.js";
import { lineOutcome, rejectedOutcome } from "./card-refund-drafts.js";
import { CardRefundEffectsWriter, RefundEffects } from "./card-refund-effects.js";
import { issuedFact, stoppedFact } from "./card-refund-journal.js";
import { CardRefundScope, type LockedPayment } from "./card-refund-scope.js";

/** Ce que le constat a trouvé : un paiement à nous, ou rien. */
export type RefundObservation = "observed" | "unmatched";

type Recorded = Extract<CardRefundRecording, { kind: "recorded" }>;

/** Le motif d'une demande ouverte par une inversion sans demande (§6.2). */
const REVERSAL_REASON = "refund_reversed";

/** Le constat en cours : l'argent verrouillé, la demande concernée, ce qui reste à écrire. */
interface Observing {
  readonly locked: LockedPayment;
  readonly siblings: readonly CardRefundRequest[];
  /** La demande de CE `re_…`, de la génération courante — ou `null`. */
  readonly request: CardRefundRequest | null;
  /** La demande qui l'a émis, quelle que soit sa génération : la ligne lui est attribuée. */
  readonly issuer: CardRefundRequest | null;
  readonly changed: Set<CardRefundRequest>;
  readonly effects: RefundEffects;
}

/**
 * **Le constat d'un remboursement** (plan M2, §3.4, §6.2, §6.3) — appelé par
 * le webhook (`RecordProviderEventHandler`), sans bail. Plus de relais par un
 * fait durable vers `orders` : le bloc constate lui-même, dans UNE
 * transaction et l'ordre du §3.6 — `lockSubject`, le paiement et son carnet,
 * les demandes relues ; le carnet et les demandes écrits ; le journal, les
 * cloches, les faits durables ; puis le canal `onRefundOutcome` avec la
 * position recalculée.
 *
 * La demande se retrouve par son `re_…`, sinon par la métadonnée de
 * l'événement (`lfd_refund_request`, `lfd_generation`) ; une autre génération
 * est ignorée (la ligne entre au carnet, la demande ne bouge pas). Un statut
 * périmé est ignoré, rien n'est écrit ; un refus du carnet va au canal
 * (`rejected`) et n'écrit rien au carnet.
 */
@Injectable()
export class CardRefundObservation {
  private readonly logger = new Logger(CardRefundObservation.name);

  constructor(
    private readonly resolver: ProviderPaymentResolver,
    private readonly scope: CardRefundScope,
    private readonly requests: CardRefundRequestRepository,
    private readonly ledgers: CardRefundLedgerRepository,
    private readonly refunds: CardRefunds,
    private readonly effects: CardRefundEffectsWriter,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  observe(account: PaymentAccount, event: RefundEvent): Promise<RefundObservation> {
    return this.uow.run(async () => {
      const payment = await this.resolver.resolve(account, event.providerRef);
      const locked = payment === null ? null : await this.scope.lock(payment.id);
      if (locked === null) {
        return "unmatched";
      }
      const siblings = await this.requests.ofPayment(locked.ledger.paymentId);
      const state: Observing = {
        locked,
        siblings,
        ...requestsOf(siblings, event),
        changed: new Set(),
        effects: new RefundEffects(),
      };
      const recording = this.record(state, reportOf(event));
      if (recording !== null) {
        await this.ledgers.save(locked.ledger);
        this.decide(state, recording);
      }
      await this.persist(state);
      if (recording !== null && isOrphanReversal(state, recording)) {
        await this.reopenIfCancelled(state);
      }
      await this.effects.flush(locked, state.effects);
      return "observed";
    });
  }

  /** Le carnet : `null` quand rien ne s'écrit (périmé, ou refusé). */
  private record(state: Observing, report: CardRefundReport): Recorded | null {
    const { locked, request, issuer, effects } = state;
    try {
      const attribution =
        issuer === null ? null : { requestId: issuer.id, nature: issuer.view.nature };
      const recording = locked.ledger.record(
        report,
        attribution,
        this.ids.next(),
        this.clock.now(),
      );
      if (recording.kind === "unchanged") {
        this.logger.log(`Remboursement ${report.providerRef} : statut périmé, ignoré.`);
        return null;
      }
      return recording;
    } catch (error) {
      if (!(error instanceof CardRefundRejectedError)) {
        throw error;
      }
      effects.outcome(rejectedOutcome(report, error.reason, request?.id ?? null));
      if (request?.isInProgress() === true) {
        request.stop(`rejected:${error.reason}`, null);
        effects.journal((label) => stoppedFact(request, label));
        state.changed.add(request);
      }
      return null;
    }
  }

  /** La ligne écrite, ce qu'elle fait aux demandes du paiement — sans encore les écrire. */
  private decide(state: Observing, recording: Recorded): void {
    const { locked, effects } = state;
    const { line, before } = recording;
    effects.outcome(lineOutcome(line, before));
    if (line.status === "failed" && before === "succeeded") {
      this.reversed(state, line.providerRef ?? "", line.amountCents);
    } else {
      this.advance(state, line.providerRef ?? "", line.amountCents, line.status);
      if (line.requestId === null && before === null && line.status === "succeeded") {
        effects.ringOrphan(line.providerRef ?? "", line.amountCents, "unattributed");
      }
    }
    if (line.status === "succeeded" && locked.ledger.remainderCents() <= 0) {
      for (const sibling of state.siblings) {
        if (sibling.settleWithoutRemainder()) {
          state.changed.add(sibling);
        }
      }
    }
  }

  /** La demande de ce `re_…` suit son statut — arrivé avant l'exécuteur, ou après. */
  private advance(
    state: Observing,
    providerRef: string,
    amountCents: number,
    status: CardRefundReport["status"],
  ): void {
    const { request, effects } = state;
    if (request === null || !request.isInProgress()) {
      return;
    }
    const from = request.current;
    const effect = request.acceptIssuance(providerRef, amountCents, status, null, this.clock.now());
    if (!effect.changed) {
      return;
    }
    state.changed.add(request);
    if (from === "to_issue") {
      effects.journal((label) => issuedFact(request, label));
      effects.outcome({
        kind: "issued",
        requestId: request.id,
        generation: request.generation,
        providerRef,
        announcedCents: request.view.announcedCents,
        issuedCents: amountCents,
      });
    }
    if (effect.stopped !== null) {
      effects.journal((label) => stoppedFact(request, label));
      effects.ring(
        request,
        effect.stopped === "issued_amount_mismatch" ? "amount_mismatch" : "failed",
      );
    }
  }

  /**
   * **L'inversion** (§6.2) : la demande de ce `re_…` passe `refunded →
   * stopped` et sonne ; sans demande, la cloche « hors plateforme » — et la
   * demande née arrêtée, si le sujet est annulé, après l'écriture du carnet.
   */
  private reversed(state: Observing, providerRef: string, amountCents: number): void {
    const { request, issuer, effects } = state;
    if (request === null) {
      if (issuer === null) {
        effects.ringOrphan(providerRef, amountCents, "reversed");
      } else {
        effects.ring(issuer, "reversed");
      }
      return;
    }
    if (request.current === "refunded" && request.view.providerRef === providerRef) {
      request.reverse();
      state.changed.add(request);
      effects.journal((label) => stoppedFact(request, label));
    }
    effects.ring(request, "reversed");
  }

  private async reopenIfCancelled(state: Observing): Promise<void> {
    const { locked } = state;
    if (!(await locked.settlement.isCancelled(locked.subject))) {
      return;
    }
    await this.refunds.requestRemainder(
      { subject: locked.subject },
      { nature: "return", reason: REVERSAL_REASON, schedule: "button", requestedBy: null },
    );
  }

  private async persist(state: Observing): Promise<void> {
    for (const request of state.changed) {
      if (!(await this.requests.transition(request))) {
        this.logger.warn(`Demande ${request.id} : changée pendant le constat, issue ignorée.`);
      }
    }
  }
}

/** Une inversion d'un `re_…` qu'aucune demande n'a émis (§6.2). */
function isOrphanReversal(state: Observing, recording: Recorded): boolean {
  return (
    state.issuer === null && recording.line.status === "failed" && recording.before === "succeeded"
  );
}

function reportOf(event: RefundEvent): CardRefundReport {
  return {
    providerRef: event.refundId,
    amountCents: event.amountCents,
    currency: event.currency,
    status: event.status,
    refundedAt: event.createdAt,
  };
}

/**
 * La demande de ce `re_…` : par son `re_…` (la génération courante, par
 * construction : « Relancer » l'efface), sinon par la métadonnée. La ligne est
 * attribuée à la demande qui l'a émis, quelle que soit sa génération ; seule la
 * génération COURANTE bouge — une autre est ignorée (§3.4).
 */
function requestsOf(
  siblings: readonly CardRefundRequest[],
  event: RefundEvent,
): { readonly request: CardRefundRequest | null; readonly issuer: CardRefundRequest | null } {
  const byRef = siblings.find((request) => request.view.providerRef === event.refundId);
  if (byRef !== undefined) {
    return { request: byRef, issuer: byRef };
  }
  const ours = event.ours;
  const issuer =
    ours === undefined ? null : (siblings.find((request) => request.id === ours.requestId) ?? null);
  const current = issuer !== null && issuer.generation === ours?.generation ? issuer : null;
  return { request: current, issuer };
}
