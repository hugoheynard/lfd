import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { DurableFactPayloads } from "../../../../platform/outbox/durable-fact-payloads.js";
import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MailDeliveryFailedEvent } from "../../../channels/deliveries/mail-delivery-failed.event.js";
import { MailRequest } from "../../domain/entities/mail-request.js";
import { MailAttachmentStore } from "../../domain/ports/mail-attachment.store.js";
import {
  MailDispatch,
  type MailDispatchReceipt,
  type OutgoingMail,
} from "../../domain/ports/mail-dispatch.js";
import type { StoredPdfRef } from "../../domain/services/stored-pdfs.js";
import { MailRequestRepository } from "../../domain/ports/mail-request.repository.js";
import { RecordedMailDeliveries } from "../../domain/ports/recorded-mail-deliveries.js";
import {
  UnappliedMailDeliveries,
  type UnappliedMailDelivery,
} from "../../domain/ports/unapplied-mail-deliveries.js";
import {
  deliveryOutranks,
  type MailDeliveryReport,
} from "../../domain/value-objects/mail-delivery.js";
import {
  type StalledMailCriteria,
  StalledMailRequests,
} from "../../domain/ports/stalled-mail-requests.js";
import { UnitOfWorkProbe } from "../../domain/ports/unit-of-work-probe.js";
import { BlockMail } from "../block-mail.js";
import { DeferredMailSender } from "../deferred-mail-sender.service.js";
import { DeliverRequestedMail } from "../deliver-requested-mail.handler.js";
import { ImmediateMailSender } from "../immediate-mail-sender.service.js";
import { MailRequester } from "../mail-requester.service.js";
import { MailAttachments } from "../mail-attachments.js";
import { MailDeliveryApplier } from "../mail-delivery-applier.js";
import { MailOutcomeRecorder } from "../mail-outcome-recorder.js";
import { MailSendAttempt } from "../mail-send-attempt.js";
import { SweepMailRequestsHandler } from "../sweep-mail-requests.handler.js";

/**
 * Le suivi en mémoire, rangé par clé d'idempotence comme en base ; `save`
 * écrit les entrées dans l'échec à la boîte d'envoi, comme l'adaptateur.
 */
export class InMemoryMailRequests extends MailRequestRepository {
  readonly rows = new Map<string, MailRequest>();

  constructor(private readonly publisher: DurablePublisher) {
    super();
  }

  findByIdempotencyKey(key: string): Promise<MailRequest | null> {
    const row = this.rows.get(key);
    return Promise.resolve(row === undefined ? null : MailRequest.rehydrate(row.snapshot()));
  }

  addIfAbsent(request: MailRequest): Promise<boolean> {
    if (this.rows.has(request.idempotencyKey)) {
      return Promise.resolve(false);
    }
    this.rows.set(request.idempotencyKey, request);
    return Promise.resolve(true);
  }

  findByProviderId(providerId: string): Promise<readonly MailRequest[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.providerId === providerId)
        .map((row) => MailRequest.rehydrate(row.snapshot())),
    );
  }

  async save(request: MailRequest): Promise<void> {
    this.rows.set(request.idempotencyKey, MailRequest.rehydrate(request.snapshot()));
    for (const failure of request.pullDeliveryFailures()) {
      await this.publisher.publish(new MailDeliveryFailedEvent(failure).durableFact());
    }
  }
}

/** Les retours rangés, dans l'ordre de réception — la table `mail_delivery_event` en mémoire. */
export class InMemoryDeliveryEvents {
  readonly events: { readonly providerId: string; readonly report: MailDeliveryReport }[] = [];

  record(providerId: string, report: MailDeliveryReport): void {
    this.events.push({ providerId, report });
  }
}

/** La relecture à la pose de l'identifiant. */
export class RecordedDeliveriesOf extends RecordedMailDeliveries {
  constructor(private readonly store: InMemoryDeliveryEvents) {
    super();
  }

  recordedFor(providerId: string): Promise<readonly MailDeliveryReport[]> {
    return Promise.resolve(
      this.store.events.filter((one) => one.providerId === providerId).map((one) => one.report),
    );
  }
}

/**
 * Les retours manqués, filtrés comme la requête de l'adaptateur : plus graves
 * que la demande qui porte l'identifiant. L'e2e prouve que le SQL dit pareil.
 */
export class UnappliedDeliveriesOf extends UnappliedMailDeliveries {
  constructor(
    private readonly store: InMemoryDeliveryEvents,
    private readonly requests: InMemoryMailRequests,
  ) {
    super();
  }

  due(_receivedSince: Date, limit: number): Promise<readonly UnappliedMailDelivery[]> {
    const rows = [...this.requests.rows.values()].map((row) => row.snapshot());
    const due = this.store.events.filter((one) =>
      rows.some(
        (row) =>
          row.providerId === one.providerId && deliveryOutranks(one.report.delivery, row.delivery),
      ),
    );
    return Promise.resolve(due.slice(0, limit));
  }
}

/**
 * Les envois en retard, filtrés comme la requête de l'adaptateur Prisma : la
 * même condition, écrite une seconde fois pour que le balayeur s'éprouve sans
 * base. L'e2e prouve que la vraie requête dit la même chose.
 */
export class InMemoryStalledMailRequests extends StalledMailRequests {
  constructor(private readonly requests: InMemoryMailRequests) {
    super();
  }

  due(criteria: StalledMailCriteria): Promise<readonly MailRequest[]> {
    const late = (at: Date | null): boolean =>
      at !== null && at.getTime() < criteria.attemptedBefore.getTime();
    const due = [...this.requests.rows.values()]
      .map((row) => row.snapshot())
      .filter(
        (row) =>
          (row.status === "sending" && late(row.lastAttemptAt)) ||
          (row.status === "failed" &&
            late(row.lastAttemptAt) &&
            row.firstAttemptAt !== null &&
            row.firstAttemptAt.getTime() >= criteria.firstAttemptSince.getTime() &&
            row.attempts < criteria.maxAttempts),
      )
      .slice(0, criteria.limit)
      .map((row) => MailRequest.rehydrate(row));
    return Promise.resolve(due);
  }
}

/** Les charges des faits écrits, relues par leur clé. */
export class FactPayloadsOf extends DurableFactPayloads {
  constructor(private readonly facts: RecordingFacts) {
    super();
  }

  payloadOf(key: string): Promise<Readonly<Record<string, unknown>> | null> {
    return Promise.resolve(this.facts.facts.find((fact) => fact.key === key)?.payload ?? null);
  }
}

/** L'envoi enregistré ; `failWith` fait échouer le prochain envoi. */
export class RecordingDispatch extends MailDispatch {
  readonly sent: OutgoingMail[] = [];
  failWith: Error | null = null;

  /** La version du document que le prochain envoi dira l'avoir composé (S4c). */
  documentVersion: number | null = null;

  dispatch(mail: OutgoingMail): Promise<MailDispatchReceipt> {
    if (this.failWith !== null) {
      const error = this.failWith;
      this.failWith = null;
      return Promise.reject(error);
    }
    this.sent.push(mail);
    return Promise.resolve({
      providerId: `re_${this.sent.length}`,
      documentVersion: this.documentVersion,
    });
  }
}

/** Le stockage des pièces, en mémoire : `put` y dépose, `reads` compte les relectures. */
export class InMemoryAttachmentStore extends MailAttachmentStore {
  readonly files = new Map<string, Buffer>();
  reads = 0;

  put(key: string, bytes: Buffer): void {
    this.files.set(key, bytes);
  }

  readIfPresent(ref: StoredPdfRef): Promise<Buffer | null> {
    this.reads += 1;
    return Promise.resolve(this.files.get(ref.key) ?? null);
  }
}

/** Les faits durables écrits, dans l'ordre. */
export class RecordingFacts extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }
}

/** Une unité de travail ouverte ou non, au choix du test. */
export class SwitchableProbe extends UnitOfWorkProbe {
  open = false;

  isOpen(): boolean {
    return this.open;
  }
}

/** Le bloc monté à la main sur ses doubles. */
export function mailScene() {
  const facts = new RecordingFacts();
  const requests = new InMemoryMailRequests(facts);
  const dispatch = new RecordingDispatch();
  const probe = new SwitchableProbe();
  const clock = new FixedClock(new Date(0));
  const ids = new FixedIdGenerator("mail");
  const afterCommit = new HeldAfterCommit();
  const attachments = new InMemoryAttachmentStore();
  const deliveries = new InMemoryDeliveryEvents();
  const unitOfWork = new DirectUnitOfWork();
  const outcomes = new MailOutcomeRecorder(
    requests,
    new RecordedDeliveriesOf(deliveries),
    unitOfWork,
  );
  const applier = new MailDeliveryApplier(
    requests,
    new UnappliedDeliveriesOf(deliveries, requests),
    unitOfWork,
    clock,
  );
  const attempt = new MailSendAttempt(dispatch, new MailAttachments(attachments), clock);
  const deferred = new DeferredMailSender(outcomes, attempt);
  const requester = new MailRequester(requests, facts, probe, clock, ids);
  const immediate = new ImmediateMailSender(requests, attempt, outcomes, probe, clock, ids);
  const sweeper = new SweepMailRequestsHandler(
    new InMemoryStalledMailRequests(requests),
    requests,
    new FactPayloadsOf(facts),
    deferred,
    applier,
    clock,
  );
  return {
    requests,
    deliveries,
    applier,
    attachments,
    dispatch,
    facts,
    probe,
    clock,
    afterCommit,
    sweeper,
    port: new BlockMail(requester, immediate),
    subscriber: new DeliverRequestedMail(
      requests,
      deferred,
      afterCommit,
      new BackgroundWork(),
      clock,
    ),
  };
}
