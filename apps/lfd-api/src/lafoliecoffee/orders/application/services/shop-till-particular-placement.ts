import type { CounterParticularOrderPayload } from "@lfd/contracts";
import { orderPretaxCents } from "@lfd/money";

import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import type { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import type { ParticularStandingReader } from "../../../account/domain/ports/particular-standing.reader.js";
import type { CustomerCancellationDeadline } from "../../cancellation/application/services/customer-cancellation-deadline.js";
import type { Order } from "../../domain/entities/order.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import type { OrderRepository, PlacedOrder } from "../../domain/ports/order.repository.js";
import { ensureTotalSeen } from "../../domain/services/seen-total.js";
import type { PlaceParticularOrderAtCounterResult } from "../commands/place-particular-order-at-counter.command.js";
import { prepareCounterParticularOrder } from "./counter-particular-order-preparation.js";
import type { DraftPolicy, OrderDrafting } from "./order-drafting.service.js";
import type { StaffPlacementBinding } from "./staff-order-placement.js";

/** Ce que la passation réglée en boutique lit et écrit. */
export interface ShopTillParticularPlacementPorts {
  readonly particulars: ParticularStandingReader;
  readonly drafting: OrderDrafting;
  readonly orders: OrderRepository;
  readonly events: DomainEventPublisher;
  readonly unitOfWork: UnitOfWork;
  readonly durable: DurablePublisher;
  readonly cancellationDeadline: CustomerCancellationDeadline;
}

/** Une commande de particulier notée par l'équipe : qui saisit, et le panier. */
export interface ShopTillParticularRequest {
  readonly staffUserId: string;
  readonly payload: CounterParticularOrderPayload;
}

/**
 * **La commande d'un particulier réglée à la caisse de la boutique, une fois
 * l'intention réclamée** (`commande-particulier-reglee-en-boutique.md`,
 * § 4–5) — partagée par la saisie du comptoir
 * (`PlaceParticularOrderAtCounterHandler`) et la transformation d'un reliquat
 * de particulier (`documentation/commandes/reliquat/reliquat.md`, § 6.4), qui ne diffèrent que par leur
 * politique de composition et ce qu'elles écrivent avec la commande.
 *
 * Trois gestes qu'une copie finirait par oublier, et qui vivent donc ici
 * seulement : le délai d'annulation figé (`fixOn`), le total vu
 * (`ensureTotalSeen`) et le règlement à la caisse (`settleAtShopTill`, qui
 * pose `not_required` et le lieu `shop_till`). Oublié, le dernier laisserait
 * la commande en carte `pending`.
 *
 * Puis la transaction : le cas d'usage d'abord, la journée tenue, la
 * commande, le fait durable (accusé, situation de l'adresse), ce que le cas
 * d'usage écrit avec elle, la clé scellée — et le fait de domaine.
 */
export class ShopTillParticularPlacement {
  constructor(private readonly ports: ShopTillParticularPlacementPorts) {}

  async place(
    request: ShopTillParticularRequest,
    policy: DraftPolicy,
    binding: StaffPlacementBinding,
    seal: (result: PlaceParticularOrderAtCounterResult) => Promise<void>,
  ): Promise<PlaceParticularOrderAtCounterResult> {
    const { payload } = request;
    // Sans société, la composition ne consulte jamais le registre des
    // dérogations : `waiverUsed` vaut `null` et n'est pas lu.
    const { order } = await prepareCounterParticularOrder(
      { particulars: this.ports.particulars, drafting: this.ports.drafting },
      request.staffUserId,
      payload,
      "checkout",
      policy,
    );
    await this.settleAtShopTill(order, payload.expectedTotalCents);
    const placed = await this.persist(order, payload.requestedDeliveryDate, binding, seal);
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
    return { id: placed.id, orderNumber: placed.orderNumber, totalCents: order.totalCents };
  }

  /** Le délai d'annulation du particulier, le total vu, puis la caisse de la boutique. */
  private async settleAtShopTill(order: Order, expectedTotalCents: number): Promise<void> {
    await this.ports.cancellationDeadline.fixOn(order);
    ensureTotalSeen(order.totalCents, expectedTotalCents);
    order.settleAtShopTill();
  }

  private persist(
    order: Order,
    requestedDeliveryDate: string,
    binding: StaffPlacementBinding,
    seal: (result: PlaceParticularOrderAtCounterResult) => Promise<void>,
  ): Promise<PlacedOrder> {
    const { ports } = this;
    return ports.unitOfWork.run(async () => {
      await binding.beforePlace();
      await ports.drafting.holdSupply(order, requestedDeliveryDate);
      const written = await ports.orders.place(order);
      await ports.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
      await binding.afterPlace(written);
      await seal({
        id: written.id,
        orderNumber: written.orderNumber,
        totalCents: order.totalCents,
      });
      return written;
    });
  }
}
