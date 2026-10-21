import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
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
import { OrderProblemReportedFact } from "../../domain/order-problem-reported.fact.js";
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
 *
 * Depuis N4a (`plan-notifications-sous-comptes.md`, 2026-10-20) : sur une
 * commande d'entreprise, la demande et le fait DURABLE `order.problem_reported`
 * s'écrivent dans la même unité de travail — le principal du site en est
 * prévenu même après un redémarrage. Le fait porte le principal COPIÉ sur la
 * commande ; une commande d'avant la copie n'en a pas, et personne n'est
 * prévenu (assumé). Le courriel à l'équipe reste en mémoire, comme avant.
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
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReportOrderProblemCommand): Promise<string> {
    const photos = command.photos.map((bytes) => RequestPhoto.create(bytes));
    const { actor } = command;
    const order = await this.fulfilledOrder(command.orderId, actor.userId);
    // La société de la COMMANDE, jamais l'espace de travail (§7.3 de
    // `plan-commandes-des-sites.md`) : un membre du principal qui signale sur
    // la commande d'un site écrit la demande AU NOM DU SITE.
    const audience = await this.audiences.of(order.companyId);
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
      companyId: order.companyId,
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
    await this.persist(request, order, actor.userId);
    this.events.publish(new CustomerRequestReceivedEvent(request, reason.recipientEmail));
    return request.id;
  }

  /**
   * La demande, et sur une commande d'entreprise le fait durable qui la dit,
   * dans la même transaction : l'un ne part jamais sans l'autre.
   */
  private async persist(
    request: CustomerRequest,
    order: ReportableOrder,
    authorUserId: string,
  ): Promise<void> {
    await this.uow.run(async () => {
      await this.requests.save(request);
      if (order.site !== null) {
        const fact = new OrderProblemReportedFact(
          request.id,
          order.id,
          order.number,
          order.site,
          authorUserId,
        );
        await this.durable.publish(fact.durableFact());
      }
    });
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
