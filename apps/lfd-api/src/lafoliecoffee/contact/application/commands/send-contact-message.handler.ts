import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { trapIsFilled } from "../../domain/contact-trap.js";
import { CustomerRequest } from "../../domain/customer-request.js";
import { CustomerRequestReceivedEvent } from "../../domain/customer-request.events.js";
import { ContactSenderAudience } from "../../domain/ports/contact-sender-audience.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";
import { CustomerRequestMail } from "../services/customer-request-mail.service.js";
import { offeredReason } from "./offered-reason.js";
import { SendContactMessageCommand } from "./send-contact-message.command.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import {
  customerIntentActor,
  VISITOR_INTENT_ACTOR,
} from "../../../shared/intent/customer-intent-actor.js";

/** Le nom stable du geste, dans le registre des intentions. */
const SEND_MESSAGE_GESTURE = "contact.send-message";

/**
 * Reçoit un message « Nous écrire » — une demande `contact`
 * (`demandes-clients.md`, §3.1 et §6.5).
 *
 * L'ordre compte : le piège d'abord (un robot n'apprend rien du motif qu'il
 * a choisi), puis le motif — un motif `contact`, actif et proposé au public
 * DÉDUIT de qui écrit (visiteur → `b2c`) ; un motif `order_problem` est
 * refusé —, puis la demande, que l'agrégat refuse incomplète. Elle est RANGÉE
 * avec la demande du courriel à l'équipe, dans une seule transaction (lot S2c,
 * `plan-service-e-mails.md`) : un échec de la demande d'e-mail annule le
 * dépôt ; l'envoi part après la validation, par le bloc `mail`. La cloche
 * sonne ensuite, par son abonné, et son échec ne défait rien.
 *
 * @sans-journal ce n'est pas un acte du staff, et la charge porterait des
 * données personnelles qui s'anonymisent à douze mois ; le traitement, lui,
 * est journalisé.
 *
 * Un envoi part une fois par intention, visiteur compris (cf. `execute`).
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
    private readonly uow: UnitOfWork,
    private readonly mail: CustomerRequestMail,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * Chaque envoi passe sous sa clé d'intention : un double envoi ne dépose
   * pas deux demandes. L'acteur est le client résolu en base ; pour un
   * visiteur, un littéral (plan `documentation/ops/plan-idempotence-des-ecritures.md`,
   * § 7) — le sujet porte alors l'empreinte de la clé et du contenu, si bien
   * qu'une clé rejouée sur un autre message est refusée, jamais rendue.
   */
  execute(command: SendContactMessageCommand): Promise<void> {
    const { sender, intentKey } = command;
    const intent =
      sender === null
        ? {
            actorId: VISITOR_INTENT_ACTOR,
            key: intentKey,
            gesture: SEND_MESSAGE_GESTURE,
            subject: intentSubject("visitor", intentKey, command.payload),
          }
        : {
            actorId: customerIntentActor(sender.userId),
            key: intentKey,
            gesture: SEND_MESSAGE_GESTURE,
            subject: intentSubject(sender.companyId ?? "personal", command.payload),
          };
    return this.intents.runSealed(intent, NOTHING_TO_REPLAY, (seal) => this.send(command, seal));
  }

  private async send(
    command: SendContactMessageCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
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
    const received = new CustomerRequestReceivedEvent(request, reason.recipientEmail);
    await this.uow.run(async () => {
      await this.requests.save(request);
      await this.mail.request(received);
      await seal();
    });
    this.events.publish(received);
  }
}
