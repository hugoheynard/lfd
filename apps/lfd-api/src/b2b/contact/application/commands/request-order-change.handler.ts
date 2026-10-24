import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CustomerRequest } from "../../domain/customer-request.js";
import { CustomerRequestReceivedEvent } from "../../domain/customer-request.events.js";
import { RequestAuthorUnknownError } from "../../domain/errors/contact-errors.js";
import {
  ChangedOrderNotFoundError,
  OrderChangeAlreadyPendingError,
  OrderChangeNotRequestableError,
  OrderChangeStaleError,
} from "../../domain/errors/order-change-errors.js";
import { OrderChangeRequestedEvent } from "../../domain/order-change.events.js";
import {
  type ChangeableOrder,
  ChangeableOrderReader,
} from "../../domain/ports/changeable-order.reader.js";
import { ContactSenderAudience } from "../../domain/ports/contact-sender-audience.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import { OrderChangeRequestReader } from "../../domain/ports/order-change-request.reader.js";
import { RequestAuthorDirectory } from "../../domain/ports/request-author.directory.js";
import { orderChangeReason } from "./order-change-reason.js";
import { RequestOrderChangeCommand } from "./request-order-change.command.js";
import { RequestReasonReader } from "../../domain/ports/request-reason.reader.js";
import { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";

/**
 * **Demander une modification** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §4, M4).
 *
 * L'ordre : la commande par LA règle d'accès et LA règle de la modification
 * (hors périmètre → 404 ; « trop tard » est le SEUL cas admis, le reste
 * → 409 qui dit quoi faire), la révision sur laquelle le client a composé
 * (une commande modifiée entre-temps → 409), une seule demande en attente par
 * commande (et un index unique partiel en base, si deux arrivaient ensemble),
 * le motif `order_change` proposé à ce public, l'auteur pris au compte.
 *
 * La composition n'est PAS jugée ici : le devis et la révision la jugeront au
 * moment où le commerce l'applique, sur la commande telle qu'elle sera.
 *
 * La demande et le fait `order.change_requested` partent dans la même unité
 * de travail ; le courriel à l'équipe et la cloche suivent, en mémoire, comme
 * pour toute demande.
 */
@CommandHandler(RequestOrderChangeCommand)
export class RequestOrderChangeHandler implements ICommandHandler<
  RequestOrderChangeCommand,
  string
> {
  constructor(
    private readonly orders: ChangeableOrderReader,
    private readonly pending: OrderChangeRequestReader,
    private readonly reasonReader: RequestReasonReader,
    private readonly reasons: RequestReasonRepository,
    private readonly authors: RequestAuthorDirectory,
    private readonly audiences: ContactSenderAudience,
    private readonly requests: CustomerRequestRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RequestOrderChangeCommand): Promise<string> {
    const { actor } = command;
    const { expectedRevision, ...change } = command.payload.change;
    const order = await this.requestableOrder(command.orderId, actor.userId, expectedRevision);
    const audience = await this.audiences.of(order.companyId);
    const reason = await orderChangeReason(this.reasonReader, this.reasons, audience);
    const author = await this.authors.of(actor.userId);
    if (author === null) {
      throw new RequestAuthorUnknownError(actor.userId);
    }
    const request = CustomerRequest.orderChange({
      id: this.ids.next(),
      reason: { id: reason.id, labelFr: reason.labelFr, priority: reason.priority },
      audience,
      author,
      body: command.payload.message,
      userId: actor.userId,
      companyId: order.companyId,
      order: { id: order.id, number: order.number },
      baseRevision: order.revision,
      change,
      at: this.clock.now(),
    });
    await this.uow.run(async () => {
      await this.requests.save(request);
      await this.events.publishTraced(
        new OrderChangeRequestedEvent({
          requestId: request.id,
          order: { id: order.id, number: order.number },
          baseRevision: order.revision,
        }),
      );
    });
    this.events.publish(new CustomerRequestReceivedEvent(request, reason.recipientEmail));
    return request.id;
  }

  /**
   * @throws {ChangedOrderNotFoundError} hors périmètre.
   * @throws {OrderChangeNotRequestableError} pas « trop tard ».
   * @throws {OrderChangeStaleError} modifiée depuis la composition.
   * @throws {OrderChangeAlreadyPendingError} une demande attend déjà.
   */
  private async requestableOrder(
    orderId: string,
    actorUserId: string,
    expectedRevision: number,
  ): Promise<ChangeableOrder> {
    const order = await this.orders.visibleTo(orderId, actorUserId);
    if (order === null) {
      throw new ChangedOrderNotFoundError(orderId);
    }
    if (order.standing !== "too_late") {
      throw new OrderChangeNotRequestableError(
        order.number,
        order.standing === "revisable" ? "still_revisable" : "closed",
      );
    }
    if (order.revision !== expectedRevision) {
      throw new OrderChangeStaleError(order.number);
    }
    if (await this.pending.hasPending(order.id)) {
      throw new OrderChangeAlreadyPendingError(order.number);
    }
    return order;
  }
}
