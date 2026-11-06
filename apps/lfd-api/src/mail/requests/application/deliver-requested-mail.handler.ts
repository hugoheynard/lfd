import { Injectable, Logger } from "@nestjs/common";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../platform/time/clock.js";
import type { MailRequest } from "../domain/entities/mail-request.js";
import { MailRequestMissingError } from "../domain/errors/mail-request.errors.js";
import type { OutgoingMail } from "../domain/ports/mail-dispatch.js";
import { MailRequestRepository } from "../domain/ports/mail-request.repository.js";
import { DeferredMailSender } from "./deferred-mail-sender.service.js";
import { MAIL_REQUESTED, outgoingMailOf } from "./mail-requested.fact.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const DELIVER_REQUESTED_MAIL = "mail.deliver-requested-mail.on-requested";

/**
 * **Engage l'envoi d'un e-mail demandé**, puis l'envoie après la validation
 * (plan `plan-service-e-mails.md`, § 8 — lot S1b).
 *
 * ## Dans la transaction de livraison : marquer, et rien d'autre
 *
 * L'abonné tourne dans la transaction qui pose son reçu (`DurableDeliveryGuard`).
 * Il y charge la demande et, si elle est envoyable (`requested`, ou `failed`
 * encore reprenable), la passe en `sending` et la range. Aucun appel réseau :
 * un appel à Resend peut durer plus que la transaction (le mailer attend
 * jusqu'à 30 s sur un 429), et la connexion tenue manquerait au pool.
 *
 * ## Après la validation : l'envoi, puis une écriture courte
 *
 * L'envoi part par `AfterCommit`, hors transaction, avec la clé d'idempotence
 * de la demande, et son résultat est rangé par {@link DeferredMailSender}.
 * Une livraison annulée n'envoie rien : le rappel n'est jamais exécuté.
 *
 * ## Différer ne veut pas dire « sans relance »
 *
 * Le reçu est validé quand l'envoi part : la boîte d'envoi ne rejouera pas.
 * La relance est celle du BALAYEUR du bloc (`SweepMailRequestsHandler`) : un
 * `sending` resté orphelin (processus tombé entre la validation et l'envoi)
 * ou un `failed` reprenable repart avec la même clé, dans les 23 h de la
 * fenêtre d'idempotence de Resend. Au-delà, `failed` visible, et un humain
 * décide.
 */
@Injectable()
@DurableHandler({ type: MAIL_REQUESTED, subscriber: DELIVER_REQUESTED_MAIL })
export class DeliverRequestedMail implements DurableSubscriber {
  private readonly logger = new Logger(DeliverRequestedMail.name);

  constructor(
    private readonly requests: MailRequestRepository,
    private readonly sender: DeferredMailSender,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const mail = outgoingMailOf(delivery.payload);
    const request = await this.requests.findByIdempotencyKey(mail.idempotencyKey);
    if (request === null) {
      throw new MailRequestMissingError(mail.idempotencyKey);
    }
    // Close, déjà engagée, ou hors fenêtre : un rejeu de la livraison est sans effet.
    if (!request.isSendable(this.clock.now())) {
      return;
    }
    request.beginSending(this.clock.now());
    await this.requests.save(request);
    this.afterCommit.defer(
      () => this.work.track(this.send(request, mail), DELIVER_REQUESTED_MAIL),
      DELIVER_REQUESTED_MAIL,
    );
  }

  private async send(request: MailRequest, mail: OutgoingMail): Promise<void> {
    const outcome = await this.sender.send(request, mail);
    if (outcome.kind === "failed" || outcome.kind === "in-flight") {
      this.logger.warn(
        `E-mail « ${mail.template} » non parti (${outcome.kind}) : le balayeur le reprendra.`,
      );
    }
  }
}
