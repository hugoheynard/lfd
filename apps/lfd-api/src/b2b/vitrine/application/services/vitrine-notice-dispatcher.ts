import { Inject, Injectable, Logger } from "@nestjs/common";

import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { Clock } from "../../../../platform/time/clock.js";
import { VitrineNoticeRepository } from "../../domain/ports/vitrine-notice.repository.js";
import type { VitrineNotice, VitrineNoticeRecipientRow } from "../../domain/vitrine-notice.js";

/**
 * **Envoie une annonce à des destinataires** et consigne chaque issue dès
 * qu'elle est connue — partagé par l'envoi et la reprise, qui ne diffèrent
 * que par la liste qu'ils lui donnent.
 *
 * Chaque e-mail part avec la clé `vitrine-notice:<annonce>:<abonné>`, la même
 * à l'envoi et à la reprise : Resend dédoublonne, et un e-mail accepté juste
 * avant une interruption ne part pas deux fois.
 *
 * `mailSent` vaut `mailer.enabled` après un envoi accepté (comme l'ouverture
 * d'accès) : à blanc, rien n'est parti et on ne le prétend pas. Un refus du
 * fournisseur est consigné `false` et l'envoi continue pour les autres ; le
 * log porte l'id de l'annonce et de l'abonné, JAMAIS l'adresse.
 */
@Injectable()
export class VitrineNoticeDispatcher {
  private readonly logger = new Logger(VitrineNoticeDispatcher.name);

  constructor(
    private readonly notices: VitrineNoticeRepository,
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly clock: Clock,
  ) {}

  async dispatch(
    notice: VitrineNotice,
    recipients: readonly VitrineNoticeRecipientRow[],
  ): Promise<void> {
    for (const recipient of recipients) {
      const mailSent = await this.deliver(notice, recipient.subscriberId, recipient.contactEmail);
      notice.recordAttempt(recipient.subscriberId, mailSent, this.clock.now());
      await this.notices.save(notice);
    }
  }

  private async deliver(notice: VitrineNotice, subscriberId: string, to: string): Promise<boolean> {
    try {
      await this.mailer.send({
        to,
        template: "agency.vitrine-notice",
        data: { subject: notice.text.subject, message: notice.text.message },
        idempotencyKey: `vitrine-notice:${notice.id}:${subscriberId}`,
      });
      return this.mailer.enabled;
    } catch (error) {
      this.logger.error(
        `Annonce ${notice.id} non acceptée pour l'abonné ${subscriberId} : consignée « non envoyée ».`,
        error,
      );
      return false;
    }
  }
}
