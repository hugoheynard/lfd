import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { MailRequest } from "../domain/entities/mail-request.js";
import {
  MailRequestMissingError,
  MailRequestOutsideUnitOfWorkError,
} from "../domain/errors/mail-request.errors.js";
import type { OutgoingMail } from "../domain/ports/mail-dispatch.js";
import { MailRequestRepository } from "../domain/ports/mail-request.repository.js";
import { UnitOfWorkProbe } from "../domain/ports/unit-of-work-probe.js";
import { mailLocaleOf } from "../domain/services/mail-locale.js";
import { mailRequestedFact } from "./mail-requested.fact.js";

/** Une demande dont le canal a déjà vérifié le type. */
export interface CheckedMailDemand extends OutgoingMail {
  readonly brand: string;
}

/** Une demande neuve, à partir de ce que l'appelant fournit. */
export function newMailRequest(demand: CheckedMailDemand, id: string, at: Date): MailRequest {
  return MailRequest.request({
    id,
    template: demand.template,
    brand: demand.brand,
    recipient: demand.to,
    locale: mailLocaleOf(demand.data),
    idempotencyKey: demand.idempotencyKey,
    requestedAt: at,
  });
}

/**
 * **Demander un e-mail** — le geste par défaut (plan C2, `request`).
 *
 * La ligne de suivi ET le fait `mail.requested` s'écrivent dans la transaction
 * de l'appelant : une écriture annulée n'envoie rien, une écriture validée part
 * par la boîte d'envoi même si le processus tombe juste après.
 *
 * Une clé déjà connue ne fait rien : ni ligne, ni fait. C'est ce qui permet à
 * un appelant de redemander sans compter. L'identifiant rendu est alors celui
 * de la demande qui existait.
 */
@Injectable()
export class MailRequester {
  constructor(
    private readonly requests: MailRequestRepository,
    private readonly publisher: DurablePublisher,
    private readonly unitOfWork: UnitOfWorkProbe,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async request(demand: CheckedMailDemand): Promise<string> {
    // Avant toute écriture : hors transaction, la ligne partirait seule et le
    // fait lèverait ensuite — un suivi « demandé » que rien n'enverrait.
    if (!this.unitOfWork.isOpen()) {
      throw new MailRequestOutsideUnitOfWorkError(demand.template);
    }
    const request = newMailRequest(demand, this.ids.next(), this.clock.now());
    if (!(await this.requests.addIfAbsent(request))) {
      return this.knownIdOf(demand.idempotencyKey);
    }
    await this.publisher.publish(mailRequestedFact(demand));
    return request.id;
  }

  private async knownIdOf(idempotencyKey: string): Promise<string> {
    const known = await this.requests.findByIdempotencyKey(idempotencyKey);
    // `addIfAbsent` vient de la voir : son absence serait une base incohérente.
    if (known === null) {
      throw new MailRequestMissingError(idempotencyKey);
    }
    return known.id;
  }
}
