import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import type { MailRequest } from "../domain/entities/mail-request.js";
import {
  InvalidMailRequestError,
  MailAttachmentMissingError,
  MailInFlightError,
  MailRefusedError,
} from "../domain/errors/mail-request.errors.js";
import { MailDispatch, type OutgoingMail } from "../domain/ports/mail-dispatch.js";
import { MailAttachments } from "./mail-attachments.js";

/** Ce qu'un essai d'envoi a donné ; la demande a déjà pris la transition. */
export type MailAttemptOutcome =
  | { readonly kind: "sent" }
  | {
      readonly kind: "refused";
      readonly error: Unhealable;
    }
  | { readonly kind: "in-flight"; readonly error: MailInFlightError }
  | { readonly kind: "failed"; readonly error: unknown };

/** Ce qu'un nouvel essai ne guérira pas : refus du fournisseur, pièce absente ou mal désignée. */
type Unhealable = MailRefusedError | MailAttachmentMissingError | InvalidMailRequestError;

function isUnhealable(error: unknown): error is Unhealable {
  return (
    error instanceof MailRefusedError ||
    error instanceof MailAttachmentMissingError ||
    error instanceof InvalidMailRequestError
  );
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * **Un essai d'envoi**, partagé par les deux gestes : envoyer, puis faire
 * prendre à la demande la transition qui dit ce qui s'est passé. Il ne range
 * rien — c'est à l'appelant d'écrire l'issue (`sendAndAwaitReceipt`, l'envoi différé
 * d'après validation, le balayeur).
 *
 * Un envoi de même clé encore en cours chez le fournisseur (`in-flight`) ne
 * fait prendre AUCUNE transition : une demande différée reste `sending`, et le
 * balayeur la reprendra (plan § 8).
 */
@Injectable()
export class MailSendAttempt {
  constructor(
    private readonly dispatch: MailDispatch,
    private readonly attachments: MailAttachments,
    private readonly clock: Clock,
  ) {}

  async attempt(request: MailRequest, mail: OutgoingMail): Promise<MailAttemptOutcome> {
    try {
      // Les pièces sont relues à CHAQUE essai : la demande n'en porte que la place.
      const providerId = await this.dispatch.dispatch(await this.attachments.resolve(mail));
      request.markSent(providerId, this.clock.now());
      return { kind: "sent" };
    } catch (error) {
      if (error instanceof MailInFlightError) {
        return { kind: "in-flight", error };
      }
      if (isUnhealable(error)) {
        request.markRefused(error.message, this.clock.now());
        return { kind: "refused", error };
      }
      request.markFailed(reasonOf(error), this.clock.now());
      return { kind: "failed", error };
    }
  }
}
