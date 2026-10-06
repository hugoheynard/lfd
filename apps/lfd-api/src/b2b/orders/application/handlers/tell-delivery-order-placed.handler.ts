import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { DeliveryOrderPlacedListener } from "../../../../delivery/channels/commerce/index.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";

/**
 * **Dire à la livraison qu'une commande est passée**
 * (`documentation/livraisons/composition-automatique.md`, Q4, lot CA0) : elle
 * situe l'adresse pour que le prévisionnel du jour ait un point.
 *
 * Le commerce ne trie rien ici (retrait ou livraison, jour) : la livraison
 * relit la commande par son canal et décide. L'appel rend la main tout de
 * suite — la livraison s'engage, par son contrat, à ne jamais faire attendre
 * ni échouer la passation.
 */
@EventsHandler(OrderPlacedEvent)
export class TellDeliveryOrderPlaced implements IEventHandler<OrderPlacedEvent> {
  constructor(
    private readonly delivery: DeliveryOrderPlacedListener,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderPlacedEvent): void {
    void this.work.track(this.tell(event.orderId), "orders:tell-delivery-order-placed");
  }

  private tell(orderId: string): Promise<void> {
    this.delivery.orderPlaced(orderId);
    return Promise.resolve();
  }
}
