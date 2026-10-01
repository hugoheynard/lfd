import { Injectable } from "@nestjs/common";

import { DepartedOrdersAnnouncer } from "../../../delivery/channels/handover/index.js";
import { OrderDepartureRepository } from "../../domain/ports/order-departure.repository.js";

/**
 * **« Elles sont parties »** — le retrait prend acte que la garde est passée
 * au livreur (`plan-a-la-porte.md`, § 10 ter, BQ). Il le garde par commande,
 * et le dit au fournil (`OrderCustodyReader`) : plus de verdict qualité sur
 * une commande partie.
 */
@Injectable()
export class HandoverDepartedOrders extends DepartedOrdersAnnouncer {
  constructor(private readonly departures: OrderDepartureRepository) {
    super();
  }

  async ordersDeparted(orderIds: readonly string[], at: Date): Promise<void> {
    await this.departures.recordDeparted(orderIds, at);
  }
}
