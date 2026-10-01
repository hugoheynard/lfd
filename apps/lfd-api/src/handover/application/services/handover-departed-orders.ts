import { Injectable } from "@nestjs/common";

import {
  type BroughtBackOrdersAnnouncer,
  DepartedOrdersAnnouncer,
} from "../../../delivery/channels/handover/index.js";
import { OrderDepartureRepository } from "../../domain/ports/order-departure.repository.js";

/**
 * **« Elles sont parties »** — le retrait prend acte que la garde est passée
 * au livreur (`plan-a-la-porte.md`, § 10 ter, BQ). Il le garde par commande,
 * et le dit au fournil (`OrderCustodyReader`) : plus de verdict qualité sur
 * une commande partie.
 *
 * Il entend aussi le retour d'une commande « rapportée » (B3, LB-Q2) : la
 * garde revient au dépôt, le fournil peut de nouveau la contrôler. Deux ports
 * de la livraison, une seule mémoire — d'où une classe pour les deux, reliée
 * deux fois dans `appBootstrap/delivery-handover-feed.module.ts`.
 */
@Injectable()
export class HandoverDepartedOrders
  extends DepartedOrdersAnnouncer
  implements BroughtBackOrdersAnnouncer
{
  constructor(private readonly departures: OrderDepartureRepository) {
    super();
  }

  async ordersDeparted(orderIds: readonly string[], at: Date): Promise<void> {
    await this.departures.recordDeparted(orderIds, at);
  }

  async ordersBroughtBack(orderIds: readonly string[], at: Date): Promise<void> {
    await this.departures.recordReturned(orderIds, at);
  }
}
