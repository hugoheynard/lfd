import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { trapIsFilled } from "../../domain/contact-trap.js";
import { CustomerRequest } from "../../domain/customer-request.js";
import { CustomerRequestReceivedEvent } from "../../domain/customer-request.events.js";
import { ContactSenderAudience } from "../../domain/ports/contact-sender-audience.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";
import { offeredReason } from "./offered-reason.js";
import { SendContactMessageCommand } from "./send-contact-message.command.js";

/**
 * Reçoit un message « Nous écrire » — une demande `contact`
 * (`demandes-clients.md`, §3.1 et §6.5).
 *
 * L'ordre compte : le piège d'abord (un robot n'apprend rien du motif qu'il
 * a choisi), puis le motif — un motif `contact`, actif et proposé au public
 * DÉDUIT de qui écrit (visiteur → `b2c`) ; un motif `order_problem` est
 * refusé —, puis la demande, que l'agrégat refuse incomplète. Elle est RANGÉE
 * avant toute chose ; le courriel et la cloche partent ensuite, par ses
 * abonnés, et leur échec ne le défait pas.
 *
 * @sans-journal ce n'est pas un acte du staff, et la charge porterait des
 * données personnelles qui s'anonymisent à douze mois ; le traitement, lui,
 * est journalisé.
 */
@CommandHandler(SendContactMessageCommand)
export class SendContactMessageHandler implements ICommandHandler<SendContactMessageCommand, void> {
  private readonly logger = new Logger(SendContactMessageHandler.name);

  constructor(
    private readonly reasons: RequestReasonRepository,
    private readonly requests: CustomerRequestRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly audiences: ContactSenderAudience,
  ) {}

  async execute(command: SendContactMessageCommand): Promise<void> {
    const { payload, sender } = command;
    if (trapIsFilled(payload.lfd_trap)) {
      // De quoi reconnaître une vague (objet, taille, IP tronquée) — jamais
      // l'e-mail ni le texte saisis.
      this.logger.warn(
        `Message « Nous écrire » écarté par le piège : motif ${payload.reasonId}, ` +
          `${String(payload.message.length)} caractères, IP ${command.clientIp}.`,
      );
      return;
    }
    const audience = sender === null ? "b2c" : await this.audiences.of(sender.companyId);
    const reason = await offeredReason(this.reasons, payload.reasonId, "contact", audience);
    const request = CustomerRequest.contact({
      id: this.ids.next(),
      reason: { id: reason.id, labelFr: reason.labelFr, priority: reason.priority },
      audience,
      author: { name: payload.name, email: payload.email, phone: payload.phone },
      body: payload.message,
      userId: sender?.userId ?? null,
      companyId: sender?.companyId ?? null,
      at: this.clock.now(),
    });
    await this.requests.save(request);
    this.events.publish(new CustomerRequestReceivedEvent(request, reason.recipientEmail));
  }
}
