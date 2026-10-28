import { Injectable } from "@nestjs/common";

import { OrderDeparturesReader } from "../../channels/delivery/index.js";
import {
  OvenWaitingOrdersReader,
  type OvenWaitingOrders,
} from "../../../production/channels/packing/index.js";
import { PackingBoardReader } from "../../domain/ports/packing-board.reader.js";
import { ovenWaitingOrdersOf } from "../../domain/services/oven-waiting-orders.js";
import { localDepartures } from "./local-departures.js";

/**
 * **Ce qui attend le four, servi au fournil** — implémente le port que la
 * production déclare (`production/channels/packing/`, 2026-10-28).
 *
 * Les deux mêmes lectures que le poste pour cette réponse : les tables du
 * colisage, et le départ de chaque commande que la livraison sert. Le calcul
 * est `ovenWaitingOrdersOf`, la règle même de `awaitingProduction`.
 *
 * Il n'écrit rien.
 */
@Injectable()
export class BoardOvenWaitingOrdersReader extends OvenWaitingOrdersReader {
  constructor(
    private readonly board: PackingBoardReader,
    private readonly departures: OrderDeparturesReader,
  ) {
    super();
  }

  async waitingOn(serviceDay: string): Promise<ReadonlyMap<string, OvenWaitingOrders>> {
    const day = await this.board.dayOf(serviceDay);
    if (day.orders.length === 0) {
      return new Map();
    }
    const departures = await this.departures.departuresOf(day.orders.map((o) => o.orderId));
    return ovenWaitingOrdersOf(serviceDay, day, localDepartures(departures));
  }
}
