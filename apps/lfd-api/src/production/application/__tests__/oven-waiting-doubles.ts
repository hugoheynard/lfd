import {
  OvenWaitingOrdersReader,
  type OvenWaitingOrders,
} from "../../channels/packing/oven-waiting-orders.reader.js";

/**
 * Le colisage doublé : une carte fixe de ce qui attend le four, vide par
 * défaut ; `"down"` simule un colisage qui ne répond pas.
 */
export class FixedOvenWaitingOrders extends OvenWaitingOrdersReader {
  constructor(
    private readonly waiting: ReadonlyMap<string, OvenWaitingOrders> | "down" = new Map(),
  ) {
    super();
  }

  waitingOn(): Promise<ReadonlyMap<string, OvenWaitingOrders>> {
    return this.waiting === "down"
      ? Promise.reject(new Error("colisage injoignable"))
      : Promise.resolve(this.waiting);
  }
}
