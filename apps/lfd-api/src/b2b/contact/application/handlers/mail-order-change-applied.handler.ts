import { Inject, Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderChangeAppliedEvent } from "../../domain/order-change.events.js";

/**
 * **« Votre modification est faite »** — au client qui l'a demandée, à
 * l'adresse prise à son compte (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4).
 *
 * Hors de la requête, suivi par `BackgroundWork`, comme le courriel d'une
 * demande à l'équipe. Un échec d'envoi est écrit dans les logs — avec l'id de
 * la demande, jamais l'adresse — et la réponse reste lisible sur la commande
 * (`GET /me/orders/:id/change-request`). La clé d'idempotence absorbe un
 * second envoi de la même réponse.
 */
@EventsHandler(OrderChangeAppliedEvent)
export class MailOrderChangeApplied implements IEventHandler<OrderChangeAppliedEvent> {
  private readonly logger = new Logger(MailOrderChangeApplied.name);

  constructor(
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderChangeAppliedEvent): void {
    void this.work.track(this.run(event), "mail-order-change-applied");
  }

  private async run(event: OrderChangeAppliedEvent): Promise<void> {
    const { requestId, order } = event.subject;
    try {
      await this.mailer.send({
        to: event.request.author.email,
        template: "customer.order-change-applied",
        idempotencyKey: `order-change-applied:${requestId}`,
        data: { reference: order.number, locale: DEFAULT_MAIL_LOCALE },
      });
    } catch (error) {
      this.logger.error(
        `Courriel « modification appliquée » non envoyé (${requestId}) : la réponse reste lisible sur la commande.`,
        error,
      );
    }
  }
}
