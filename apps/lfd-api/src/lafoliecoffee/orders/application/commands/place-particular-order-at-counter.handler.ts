import { orderPretaxCents } from "@lfd/money";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import { CustomerCancellationDeadline } from "../../cancellation/application/services/customer-cancellation-deadline.js";
import type { Order } from "../../domain/entities/order.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderRepository, type PlacedOrder } from "../../domain/ports/order.repository.js";
import { ensureTotalSeen } from "../../domain/services/seen-total.js";
import { prepareCounterParticularOrder } from "../services/counter-particular-order-preparation.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import {
  PARTICULAR_COUNTER_PLACEMENT_REPLAY,
  particularCounterPlacementIntent,
} from "./particular-counter-placement-intent.js";
import {
  PlaceParticularOrderAtCounterCommand,
  type PlaceParticularOrderAtCounterResult,
} from "./place-particular-order-at-counter.command.js";

/**
 * **La commande d'un particulier notée au comptoir, réglée à la caisse de la
 * boutique** (`commande-particulier-reglee-en-boutique.md`, § 4–5).
 *
 * La composition est celle du particulier dans son espace
 * ({@link prepareCounterParticularOrder}, partagée avec l'estimation) ; le
 * règlement n'est jamais une question : `Order.settleAtShopTill` pose
 * `not_required` et le lieu `shop_till`. Aucune intention de paiement, aucun
 * lien, aucun bon de fidélité. L'accusé de commande part par le fait durable
 * `CommerceOrderPlacedFact`, comme pour toute commande décidée à la passation.
 */
@CommandHandler(PlaceParticularOrderAtCounterCommand)
export class PlaceParticularOrderAtCounterHandler implements ICommandHandler<
  PlaceParticularOrderAtCounterCommand,
  PlaceParticularOrderAtCounterResult
> {
  constructor(
    private readonly particulars: ParticularStandingReader,
    private readonly drafting: OrderDrafting,
    private readonly orders: OrderRepository,
    private readonly events: DomainEventPublisher,
    private readonly unitOfWork: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly intents: OncePerIntent,
    private readonly cancellationDeadline: CustomerCancellationDeadline,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est réclamée avant tout, et
   * se scelle dans la transaction qui écrit la commande. Un double clic rend
   * la commande déjà notée ; un refus levé avant l'écriture rend la clé.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a déjà noté un autre panier.
   */
  execute(
    command: PlaceParticularOrderAtCounterCommand,
  ): Promise<PlaceParticularOrderAtCounterResult> {
    return this.intents.runSealed(
      particularCounterPlacementIntent(command.staffUserId, command.intentKey, command.payload),
      PARTICULAR_COUNTER_PLACEMENT_REPLAY,
      (seal) => this.placeOnce(command, seal),
    );
  }

  private async placeOnce(
    command: PlaceParticularOrderAtCounterCommand,
    seal: (result: PlaceParticularOrderAtCounterResult) => Promise<void>,
  ): Promise<PlaceParticularOrderAtCounterResult> {
    const { payload } = command;
    // `waiverUsed` n'est pas lu : sans société, la composition ne consulte
    // jamais le registre des dérogations et rend `null` (`judging-order-deadline.service.ts`,
    // vérifié le 2026-11-20).
    const { order } = await prepareCounterParticularOrder(
      { particulars: this.particulars, drafting: this.drafting },
      command.staffUserId,
      payload,
      "checkout",
    );
    // Le délai d'annulation du particulier, figé comme dans son espace.
    await this.cancellationDeadline.fixOn(order);
    ensureTotalSeen(order.totalCents, payload.expectedTotalCents);
    order.settleAtShopTill();

    const placed = await this.persist(order, payload.requestedDeliveryDate, seal);
    this.events.publish(
      new OrderPlacedEvent(
        placed.id,
        placed.orderNumber,
        payload.buyerUserId,
        null,
        order.totalCents,
        orderPretaxCents(order.amounts()),
        order.clientele,
      ),
    );
    return { id: placed.id, orderNumber: placed.orderNumber, totalCents: order.totalCents };
  }

  /**
   * La journée sous son verrou, puis la commande, le fait durable (accusé,
   * situation de l'adresse) et le sceau de l'intention, dans une transaction.
   */
  private persist(
    order: Order,
    requestedDeliveryDate: string,
    seal: (result: PlaceParticularOrderAtCounterResult) => Promise<void>,
  ): Promise<PlacedOrder> {
    return this.unitOfWork.run(async () => {
      await this.drafting.holdSupply(order, requestedDeliveryDate);
      const written = await this.orders.place(order);
      await this.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
      await seal({
        id: written.id,
        orderNumber: written.orderNumber,
        totalCents: order.totalCents,
      });
      return written;
    });
  }
}
