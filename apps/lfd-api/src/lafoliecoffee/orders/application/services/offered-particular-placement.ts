import type { OfferedParticularOrderPayload } from "@lfd/contracts";
import { orderPretaxCents } from "@lfd/money";

import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import type { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import type { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import type { CustomerCancellationDeadline } from "../../cancellation/application/services/customer-cancellation-deadline.js";
import type { Order } from "../../domain/entities/order.js";
import { OfferedOrderWithoutOfferError } from "../../domain/errors/order-offer-errors.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import type { OrderRepository, PlacedOrder } from "../../domain/ports/order.repository.js";
import { ensureTotalSeen } from "../../domain/services/seen-total.js";
import type { PlaceOfferedParticularOrderResult } from "../commands/place-offered-particular-order.command.js";
import { prepareOfferedParticularOrder } from "./offered-particular-order-preparation.js";
import type { DraftPolicy, OrderDrafting } from "./order-drafting.service.js";
import { publishOrderOffered } from "./order-offering.js";
import type { StaffPlacementBinding } from "./staff-order-placement.js";

/** Ce que la passation offerte à un particulier lit et écrit. */
export interface OfferedParticularPlacementPorts {
  readonly particulars: ParticularStandingReader;
  readonly drafting: OrderDrafting;
  readonly orders: OrderRepository;
  readonly events: DomainEventPublisher;
  readonly unitOfWork: UnitOfWork;
  readonly durable: DurablePublisher;
  readonly cancellationDeadline: CustomerCancellationDeadline;
}

/** Une commande offerte à un particulier : qui saisit, et le panier avec son motif. */
export interface OfferedParticularRequest {
  readonly staffUserId: string;
  readonly payload: OfferedParticularOrderPayload;
}

/**
 * **La commande offerte à un particulier, une fois le droit jugé et
 * l'intention réclamée** (`la-commande-offerte.md`, § 2.5) — partagée par la
 * saisie (`PlaceOfferedParticularOrderHandler`) et la transformation d'un
 * reliquat de particulier (`documentation/commandes/reliquat/reliquat.md`, § 6.4), qui ne diffèrent que
 * par leur politique de composition et ce qu'elles écrivent avec la commande.
 *
 * Le délai d'annulation figé, le total vu (zéro), la valeur offerte, le
 * règlement différé (rien à encaisser) ; puis la transaction — le cas d'usage
 * d'abord, la journée tenue, la commande, le fait durable, le témoin
 * `order.offered`, ce que le cas d'usage écrit avec elle, la clé scellée — et
 * le fait de domaine.
 */
export class OfferedParticularPlacement {
  constructor(private readonly ports: OfferedParticularPlacementPorts) {}

  async place(
    request: OfferedParticularRequest,
    policy: DraftPolicy,
    binding: StaffPlacementBinding,
    seal: (result: PlaceOfferedParticularOrderResult) => Promise<void>,
  ): Promise<PlaceOfferedParticularOrderResult> {
    const { payload } = request;
    const { order } = await prepareOfferedParticularOrder(
      { particulars: this.ports.particulars, drafting: this.ports.drafting },
      request.staffUserId,
      payload,
      "checkout",
      policy,
    );
    // Le délai d'annulation du particulier, figé comme dans son espace.
    await this.ports.cancellationDeadline.fixOn(order);
    ensureTotalSeen(order.totalCents, payload.expectedTotalCents);
    const offeredTotalCents = offeredTotalCentsOf(order);
    // Offerte : rien à encaisser.
    order.deferPayment();

    const { placed, result } = await this.persist(order, request, offeredTotalCents, {
      binding,
      seal,
    });
    this.ports.events.publish(
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

  private persist(
    order: Order,
    request: OfferedParticularRequest,
    offeredTotalCents: number,
    {
      binding,
      seal,
    }: {
      readonly binding: StaffPlacementBinding;
      readonly seal: (result: PlaceOfferedParticularOrderResult) => Promise<void>;
    },
  ): Promise<{
    readonly placed: PlacedOrder;
    readonly result: PlaceOfferedParticularOrderResult;
  }> {
    const { payload } = request;
    const { ports } = this;
    return ports.unitOfWork.run(async () => {
      await binding.beforePlace();
      await ports.drafting.holdSupply(order, payload.requestedDeliveryDate);
      const written = await ports.orders.place(order);
      await ports.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
      await publishOrderOffered(ports.durable, order, written, {
        buyerUserId: payload.buyerUserId,
        staffUserId: request.staffUserId,
      });
      await binding.afterPlace(written);
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
