import { Injectable, Logger } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { Clock } from "../../../../platform/time/clock.js";
import { VitrineNoticeRepository } from "../../domain/ports/vitrine-notice.repository.js";
import type { VitrineNotice, VitrineNoticeRecipientRow } from "../../domain/vitrine-notice.js";

/**
 * **Envoie une annonce à des destinataires** et consigne chaque issue dès
 * qu'elle est connue — partagé par l'envoi et la reprise, qui ne diffèrent
 * que par la liste qu'ils lui donnent.
 *
 * Chaque e-mail part avec la clé `vitrine-notice:<annonce>:<abonné>`, la même
 * à l'envoi et à la reprise : le bloc `mail` la garde un an et rend le reçu
 * d'une clé déjà envoyée sans renvoyer — un e-mail accepté juste avant une
 * interruption ne part pas deux fois.
 *
 * **`sendAndAwaitReceipt`, pas `send`** (lot S2h, `plan-service-e-mails.md`) : chaque
 * issue est consignée sur l'annonce (`recordAttempt`) et l'écran la lit ; une
 * demande différée ne dirait que « demandé ». Aucun appelant n'ouvre d'unité
 * de travail (envoi et reprise, relus le 2026-11-06).
 *
 * `mailSent` vaut « Resend a rendu un identifiant » (comme l'ouverture
 * d'accès, S2b) : à blanc, rien n'est parti et on ne le prétend pas. Un refus du
 * fournisseur est consigné `false` et l'envoi continue pour les autres ; le
 * log porte l'id de l'annonce et de l'abonné, JAMAIS l'adresse.
 */
@Injectable()
export class VitrineNoticeDispatcher {
  private readonly logger = new Logger(VitrineNoticeDispatcher.name);

  constructor(
    private readonly notices: VitrineNoticeRepository,
    private readonly mail: Mail,
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
      const receipt = await this.mail.sendAndAwaitReceipt({
        to,
        template: "agency.vitrine-notice",
        data: { subject: notice.text.subject, message: notice.text.message },
        idempotencyKey: `vitrine-notice:${notice.id}:${subscriberId}`,
      });
      return receipt.providerId !== null;
    } catch (error) {
      this.logger.error(
        `Annonce ${notice.id} non acceptée pour l'abonné ${subscriberId} : consignée « non envoyée ».`,
        error,
      );
      return false;
    }
  }
}
