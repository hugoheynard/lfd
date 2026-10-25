import {
  OrderHandoverHistoryReader,
  type OrderHandoverHistoryFact,
} from "../../../../../handover/channels/commerce/index.js";

/**
 * Le retrait tel que le comptoir l'a attesté — vide par défaut : aucune
 * commande n'a été retirée. Hérite du port, comme les autres doubles.
 */
export class FixedHandoverHistory extends OrderHandoverHistoryReader {
  constructor(private readonly handedOver: readonly string[] = []) {
    super();
  }

  ofOrders(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderHandoverHistoryFact>> {
    const facts = orderIds
      .filter((id) => this.handedOver.includes(id))
      .map((orderId): [string, OrderHandoverHistoryFact] => [
        orderId,
        { orderId, handedOverAt: new Date(0), via: "manual", atDoor: false },
      ]);
    return Promise.resolve(new Map(facts));
  }
}
