import { Inject, Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { OrderChangeRefusedEvent } from "../../domain/order-change.events.js";

/**
 * **« Nous n'avons pas pu modifier votre commande »**, avec le mot de
 * l'équipe — au client qui l'a demandée (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M4). Mêmes règles
 * que `MailOrderChangeApplied` : en fond, un échec logué sans
 * l'adresse, la réponse toujours lisible sur la commande.
 */
@EventsHandler(OrderChangeRefusedEvent)
export class MailOrderChangeRefused implements IEventHandler<OrderChangeRefusedEvent> {
  private readonly logger = new Logger(MailOrderChangeRefused.name);

  constructor(
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderChangeRefusedEvent): void {
    void this.work.track(this.run(event), "mail-order-change-refused");
  }

  private async run(event: OrderChangeRefusedEvent): Promise<void> {
    const { requestId, order } = event.subject;
    try {
      await this.mailer.send({
        to: event.request.author.email,
        template: "customer.order-change-refused",
        idempotencyKey: `order-change-refused:${requestId}`,
        data: { reference: order.number, reason: event.reason, locale: DEFAULT_MAIL_LOCALE },
      });
    } catch (error) {
      this.logger.error(
        `Courriel « modification refusée » non envoyé (${requestId}) : la réponse reste lisible sur la commande.`,
        error,
      );
    }
  }
}
