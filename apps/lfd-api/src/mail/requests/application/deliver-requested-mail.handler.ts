import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { MailRequestMissingError } from "../domain/errors/mail-request.errors.js";
import { MailRequestRepository } from "../domain/ports/mail-request.repository.js";
import { MailSendAttempt } from "./mail-send-attempt.js";
import { MAIL_REQUESTED, outgoingMailOf } from "./mail-requested.fact.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const DELIVER_REQUESTED_MAIL = "mail.deliver-requested-mail.on-requested";

/**
 * **Envoie un e-mail demandé**, une fois la transaction de l'appelant validée.
 *
 * ## Pourquoi l'envoi se fait DANS la livraison, et pas après sa validation
 *
 * La garde commune conseille de différer un effet réseau (`AfterCommit`), au
 * prix de toute relance. Ici la relance EST la promesse (plan C2 : « un
 * service arrêté retarde, ne perd pas ») : un échec technique fait échouer la
 * livraison, la ligne reste `requested`, et la boîte d'envoi la rejoue. C'est
 * ce que font déjà les six abonnés durables d'envoi d'e-mail du commerce
 * (`SendOrderPlacedMail`, vérifié le 2026-11-06).
 *
 * ## L'idempotence, à deux étages
 *
 * Une demande close (`sent`, `refused`) n'est pas renvoyée : un rejeu de la
 * livraison est sans effet. Et la clé d'idempotence part chez le fournisseur,
 * qui dédoublonne un envoi accepté dont la validation aurait échoué ensuite.
 */
@Injectable()
@DurableHandler({ type: MAIL_REQUESTED, subscriber: DELIVER_REQUESTED_MAIL })
export class DeliverRequestedMail implements DurableSubscriber {
  constructor(
    private readonly requests: MailRequestRepository,
    private readonly attempt: MailSendAttempt,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const mail = outgoingMailOf(delivery.payload);
    const request = await this.requests.findByIdempotencyKey(mail.idempotencyKey);
    if (request === null) {
      throw new MailRequestMissingError(mail.idempotencyKey);
    }
    if (request.isSettled()) {
      return;
    }
    const outcome = await this.attempt.attempt(request, mail);
    if (outcome.kind === "failed") {
      // La livraison échoue et sera rejouée ; la transition `failed` part avec
      // l'annulation, et la ligne reste `requested`.
      throw outcome.error;
    }
    await this.requests.save(request);
  }
}
