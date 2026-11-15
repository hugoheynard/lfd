import { OrderCustodyReader, type OrderOutOfHand } from "../index.js";

/** Le retrait, tel que le fournil l'interroge : qui n'est plus là, fixé d'avance. */
export class FixedOrderCustody extends OrderCustodyReader {
  constructor(private readonly gone: ReadonlyMap<string, OrderOutOfHand> = new Map()) {
    super();
  }

  outOfHand(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderOutOfHand>> {
    return Promise.resolve(
      new Map([...this.gone].filter(([orderId]) => orderIds.includes(orderId))),
    );
  }
}
