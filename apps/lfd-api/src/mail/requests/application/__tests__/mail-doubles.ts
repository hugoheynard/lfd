import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MailRequest } from "../../domain/entities/mail-request.js";
import { MailDispatch, type OutgoingMail } from "../../domain/ports/mail-dispatch.js";
import { MailRequestRepository } from "../../domain/ports/mail-request.repository.js";
import { UnitOfWorkProbe } from "../../domain/ports/unit-of-work-probe.js";
import { BlockMailRequests } from "../block-mail-requests.js";
import { DeliverRequestedMail } from "../deliver-requested-mail.handler.js";
import { ImmediateMailSender } from "../immediate-mail-sender.service.js";
import { MailRequester } from "../mail-requester.service.js";
import { MailSendAttempt } from "../mail-send-attempt.js";

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

/** L'envoi enregistré ; `failWith` fait échouer le prochain envoi. */
export class RecordingDispatch extends MailDispatch {
  readonly sent: OutgoingMail[] = [];
  failWith: Error | null = null;

  dispatch(mail: OutgoingMail): Promise<string | null> {
    if (this.failWith !== null) {
      const error = this.failWith;
      this.failWith = null;
      return Promise.reject(error);
    }
    this.sent.push(mail);
    return Promise.resolve(`re_${this.sent.length}`);
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
  const attempt = new MailSendAttempt(dispatch, clock);
  const requester = new MailRequester(requests, facts, probe, clock, ids);
  const immediate = new ImmediateMailSender(requests, attempt, probe, clock, ids);
  return {
    requests,
    dispatch,
    facts,
    probe,
    port: new BlockMailRequests(requester, immediate),
    subscriber: new DeliverRequestedMail(requests, attempt),
  };
}
