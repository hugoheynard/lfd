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
import { OfferedOrderWithoutOfferError } from "../../domain/errors/order-offer-errors.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderRepository, type PlacedOrder } from "../../domain/ports/order.repository.js";
import { ensureTotalSeen } from "../../domain/services/seen-total.js";
import { prepareOfferedParticularOrder } from "../services/offered-particular-order-preparation.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import { ensureMayOffer, publishOrderOffered } from "../services/order-offering.js";
import {
  OFFERED_PARTICULAR_PLACEMENT_REPLAY,
  offeredParticularPlacementIntent,
} from "./offered-particular-placement-intent.js";
import {
  PlaceOfferedParticularOrderCommand,
  type PlaceOfferedParticularOrderResult,
} from "./place-offered-particular-order.command.js";

/**
 * **La commande offerte à un particulier** (`plan-commande-offerte.md`,
 * § 2.4, O7-1 à O7-5).
 *
 * Une route à part de la saisie pour une société, qui garde sa société
 * obligatoire. Les gestes de l'offre sont ceux de toute passation offerte
 * (`order-offering.ts`) : le droit `b2b_offer_order`, le motif posé sur
 * l'agrégat, le fait `order.offered` dans la transaction. La composition est
 * celle du particulier dans son espace ({@link prepareOfferedParticularOrder}),
 * puis la ligne d'offre la ramène à zéro : rien à encaisser, le règlement est
 * différé (`not_required`), sans lien ni intention de paiement.
 *
 * Pas de brouillon (O7-5) : la saisie tient en un appel.
 */
@CommandHandler(PlaceOfferedParticularOrderCommand)
export class PlaceOfferedParticularOrderHandler implements ICommandHandler<
  PlaceOfferedParticularOrderCommand,
  PlaceOfferedParticularOrderResult
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
   * **Une fois par intention** : la clé de l'écran est réclamée après la garde
   * du droit, et se scelle dans la transaction qui écrit la commande. Un
   * double clic rend la commande déjà offerte ; un refus levé avant
   * l'écriture rend la clé.
   *
   * @throws {OfferNotPermittedError} sans le droit `b2b_offer_order`.
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a déjà offert un autre panier.
   */
  async execute(
    command: PlaceOfferedParticularOrderCommand,
  ): Promise<PlaceOfferedParticularOrderResult> {
    // Avant toute intention scellée : un refus de droit ne consomme pas la clé.
    ensureMayOffer(true, command.mayOffer);
    return await this.intents.runSealed(
      offeredParticularPlacementIntent(command.staffUserId, command.intentKey, command.payload),
      OFFERED_PARTICULAR_PLACEMENT_REPLAY,
      (seal) => this.placeOnce(command, seal),
    );
  }

  private async placeOnce(
    command: PlaceOfferedParticularOrderCommand,
    seal: (result: PlaceOfferedParticularOrderResult) => Promise<void>,
  ): Promise<PlaceOfferedParticularOrderResult> {
    const { payload } = command;
    const { order } = await prepareOfferedParticularOrder(
      { particulars: this.particulars, drafting: this.drafting },
      command.staffUserId,
      payload,
      "checkout",
    );
    // Le délai d'annulation du particulier, figé comme dans son espace.
    await this.cancellationDeadline.fixOn(order);
    ensureTotalSeen(order.totalCents, payload.expectedTotalCents);
    const offeredTotalCents = offeredTotalCentsOf(order);
    // Offerte : rien à encaisser.
    order.deferPayment();

    const { placed, result } = await this.persist(order, command, offeredTotalCents, seal);
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
    return result;
  }

  /**
   * La journée sous son verrou, puis la commande, le fait qui fait situer son
   * adresse, le témoin `order.offered` et le sceau de l'intention, dans une
   * transaction.
   */
  private persist(
    order: Order,
    command: PlaceOfferedParticularOrderCommand,
    offeredTotalCents: number,
    seal: (result: PlaceOfferedParticularOrderResult) => Promise<void>,
  ): Promise<{
    readonly placed: PlacedOrder;
    readonly result: PlaceOfferedParticularOrderResult;
  }> {
    const { payload } = command;
    return this.unitOfWork.run(async () => {
      await this.drafting.holdSupply(order, payload.requestedDeliveryDate);
      const written = await this.orders.place(order);
      await this.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
      await publishOrderOffered(this.durable, order, written, {
        buyerUserId: payload.buyerUserId,
        staffUserId: command.staffUserId,
      });
      const result = {
        id: written.id,
        orderNumber: written.orderNumber,
        totalCents: order.totalCents,
        offeredTotalCents,
      };
      await seal(result);
      return { placed: written, result };
    });
  }
}

/** La valeur offerte TTC, ou le refus d'écrire une offre que l'agrégat n'a pas reçue. */
function offeredTotalCentsOf(order: Order): number {
  if (order.offer === null) {
    throw new OfferedOrderWithoutOfferError();
  }
  return order.offer.value.totalCents;
}
