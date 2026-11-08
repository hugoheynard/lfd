import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import type { MailRequest } from "../domain/entities/mail-request.js";
import {
  InvalidMailRequestError,
  MailAttachmentMissingError,
  MailInFlightError,
  MailRefusedError,
  MarketingMailRefusedError,
} from "../domain/errors/mail-request.errors.js";
import { MailDispatch, type OutgoingMail } from "../domain/ports/mail-dispatch.js";
import { MarketingClearance, type MarketingMarks } from "../domain/ports/marketing-clearance.js";
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

/**
 * Ce qu'un nouvel essai ne guérira pas : refus du fournisseur, pièce absente
 * ou mal désignée, e-mail marketing sans accord.
 */
type Unhealable =
  | MailRefusedError
  | MailAttachmentMissingError
  | InvalidMailRequestError
  | MarketingMailRefusedError;

function isUnhealable(error: unknown): error is Unhealable {
  return (
    error instanceof MailRefusedError ||
    error instanceof MarketingMailRefusedError ||
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
 *
 * **Le contrôle marketing vit ici** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, B3) : juste avant
 * l'appel au fournisseur, à CHAQUE essai — l'envoi immédiat, l'envoi différé
 * et chaque reprise du balayeur passent tous par cette méthode. Un e-mail
 * marketing sans accord est clos `refused` avec sa raison fermée, et rien ne
 * part ; autorisé, il emporte ses marques (pied et en-têtes). Course assumée :
 * une désinscription arrivée entre ce contrôle et l'acceptation du
 * fournisseur laisse partir CET e-mail.
 */
@Injectable()
export class MailSendAttempt {
  constructor(
    private readonly dispatch: MailDispatch,
    private readonly attachments: MailAttachments,
    private readonly clearance: MarketingClearance,
    private readonly clock: Clock,
  ) {}

  async attempt(request: MailRequest, mail: OutgoingMail): Promise<MailAttemptOutcome> {
    try {
      const marks = await this.marksOf(request, mail);
      // Les pièces sont relues à CHAQUE essai : la demande n'en porte que la place.
      const receipt = await this.dispatch.dispatch(await this.attachments.resolve(mail), marks);
      request.markSent(receipt.providerId, this.clock.now(), receipt.documentVersion);
      return { kind: "sent" };
    } catch (error) {
      if (error instanceof MailInFlightError) {
        return { kind: "in-flight", error };
      }
      if (error instanceof MarketingMailRefusedError) {
        request.markRefusedFor(error.refusalCode, this.clock.now());
        return { kind: "refused", error };
      }
      if (isUnhealable(error)) {
        request.markRefused(error.message, this.clock.now());
        return { kind: "refused", error };
      }
      request.markFailed(reasonOf(error), this.clock.now());
      return { kind: "failed", error };
    }
  }

  /**
   * Le verdict du contrôle marketing : `null` pour un transactionnel (le
   * registre n'est pas lu), les marques d'un marketing autorisé.
   *
   * @throws {MarketingMailRefusedError} marketing sans accord.
   */
  private async marksOf(request: MailRequest, mail: OutgoingMail): Promise<MarketingMarks | null> {
    const verdict = await this.clearance.verdictFor({
      template: mail.template,
      space: request.snapshot().brand,
      recipient: mail.to,
    });
    if (verdict.kind === "refused") {
      throw new MarketingMailRefusedError(verdict.code);
    }
    return verdict.kind === "cleared" ? verdict.marks : null;
  }
}
