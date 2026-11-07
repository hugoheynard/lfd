import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { DurableFactPayloads } from "../../../../platform/outbox/durable-fact-payloads.js";
import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MailRequest } from "../../domain/entities/mail-request.js";
import { MailAttachmentStore } from "../../domain/ports/mail-attachment.store.js";
import {
  MailDispatch,
  type MailDispatchReceipt,
  type OutgoingMail,
} from "../../domain/ports/mail-dispatch.js";
import type { StoredPdfRef } from "../../domain/services/stored-pdfs.js";
import { MailRequestRepository } from "../../domain/ports/mail-request.repository.js";
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
import { MailSendAttempt } from "../mail-send-attempt.js";
import { SweepMailRequestsHandler } from "../sweep-mail-requests.handler.js";

/** Le suivi en mémoire, rangé par clé d'idempotence comme en base. */
export class InMemoryMailRequests extends MailRequestRepository {
  readonly rows = new Map<string, MailRequest>();

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

  save(request: MailRequest): Promise<void> {
    this.rows.set(request.idempotencyKey, MailRequest.rehydrate(request.snapshot()));
    return Promise.resolve();
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
  const requests = new InMemoryMailRequests();
  const dispatch = new RecordingDispatch();
  const facts = new RecordingFacts();
  const probe = new SwitchableProbe();
  const clock = new FixedClock(new Date(0));
  const ids = new FixedIdGenerator("mail");
  const afterCommit = new HeldAfterCommit();
  const attachments = new InMemoryAttachmentStore();
  const attempt = new MailSendAttempt(dispatch, new MailAttachments(attachments), clock);
  const deferred = new DeferredMailSender(requests, attempt);
  const requester = new MailRequester(requests, facts, probe, clock, ids);
  const immediate = new ImmediateMailSender(requests, attempt, probe, clock, ids);
  const sweeper = new SweepMailRequestsHandler(
    new InMemoryStalledMailRequests(requests),
    requests,
    new FactPayloadsOf(facts),
    deferred,
    clock,
  );
  return {
    requests,
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
