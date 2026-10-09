import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CustomerRequest } from "../../domain/customer-request.js";
import { CustomerRequestReceivedEvent } from "../../domain/customer-request.events.js";
import {
  OrderNotYetFulfilledError,
  ReportedOrderNotFoundError,
  RequestAuthorUnknownError,
} from "../../domain/errors/contact-errors.js";
import { ContactSenderAudience } from "../../domain/ports/contact-sender-audience.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import {
  type ReportableOrder,
  ReportableOrderReader,
} from "../../domain/ports/reportable-order.reader.js";
import { RequestAuthorDirectory } from "../../domain/ports/request-author.directory.js";
import { RequestPhotoStore } from "../../domain/ports/request-photo.store.js";
import { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";
import { RequestPhoto } from "../../domain/request-photo.js";
import { offeredReason } from "./offered-reason.js";
import { ReportOrderProblemCommand } from "./report-order-problem.command.js";

/**
 * **Signaler un problème sur une commande** (`demandes-clients.md`,
 * §3.2, §6.3-6.5, §7).
 *
 * L'ordre compte : les photos d'abord — une photo refusée ne coûte aucune
 * lecture —, puis la commande par LA règle d'accès d'une commande (hors
 * périmètre → 404, non retirée ni livrée → 409), le motif `order_problem`
 * proposé à ce public, l'auteur pris au compte. Les photos sont rangées au
 * stockage AVANT la demande : un échec entre les deux laisse un objet que
 * rien ne cite, jamais une ligne qui cite un objet absent.
 *
 * @sans-journal comme « Nous écrire » : pas un acte du staff, et la charge
 * porterait des données qui s'anonymisent.
 */
@CommandHandler(ReportOrderProblemCommand)
export class ReportOrderProblemHandler implements ICommandHandler<
  ReportOrderProblemCommand,
  string
> {
  constructor(
    private readonly orders: ReportableOrderReader,
    private readonly reasons: RequestReasonRepository,
    private readonly authors: RequestAuthorDirectory,
    private readonly audiences: ContactSenderAudience,
    private readonly requests: CustomerRequestRepository,
    private readonly store: RequestPhotoStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: ReportOrderProblemCommand): Promise<string> {
    const photos = command.photos.map((bytes) => RequestPhoto.create(bytes));
    const { actor } = command;
    const order = await this.fulfilledOrder(command.orderId, actor.userId);
    const audience = await this.audiences.of(actor.companyId);
    const reason = await offeredReason(
      this.reasons,
      command.payload.reasonId,
      "order_problem",
      audience,
    );
    const author = await this.authors.of(actor.userId);
    if (author === null) {
      throw new RequestAuthorUnknownError(actor.userId);
    }
    const at = this.clock.now();
    const request = CustomerRequest.orderProblem({
      id: this.ids.next(),
      reason: { id: reason.id, labelFr: reason.labelFr, priority: reason.priority },
      audience,
      author,
      body: command.payload.message,
      userId: actor.userId,
      companyId: actor.companyId,
      order: { id: order.id, number: order.number },
      at,
    });
    // Toutes jointes d'abord : l'agrégat refuse la quatrième avant qu'un
    // seul objet parte au stockage.
    const attached = photos.map((photo) => ({
      photo,
      ref: request.attachPhoto(this.ids.next(), photo, at),
    }));
    for (const { photo, ref } of attached) {
      await this.store.save(ref.storageKey, { bytes: photo.bytes, contentType: photo.contentType });
    }
    await this.requests.save(request);
    this.events.publish(new CustomerRequestReceivedEvent(request, reason.recipientEmail));
    return request.id;
  }

  /** @throws {ReportedOrderNotFoundError} hors périmètre. @throws {OrderNotYetFulfilledError} pas encore reçue. */
  private async fulfilledOrder(orderId: string, actorUserId: string): Promise<ReportableOrder> {
    const order = await this.orders.visibleTo(orderId, actorUserId);
    if (order === null) {
      throw new ReportedOrderNotFoundError(orderId);
    }
    if (!order.fulfilled) {
      throw new OrderNotYetFulfilledError(order.number);
    }
    return order;
  }
}
