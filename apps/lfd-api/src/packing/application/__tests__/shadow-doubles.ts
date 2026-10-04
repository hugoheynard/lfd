import {
  PackingShadowLedger,
  type ShadowOrderToDraw,
  type ShadowReceipt,
} from "../../domain/ports/packing-shadow.ledger.js";
import {
  PackingShadowReader,
  type ShadowDay,
  type ShadowStock,
} from "../../domain/ports/packing-shadow.reader.js";

/**
 * L'ombre en mémoire, avec la sémantique de la vraie : une commande inscrite
 * une fois, un reçu une fois, une réserve qui s'additionne. Elle implémente les
 * DEUX ports (lecture et écriture) par deux classes, sur le même état.
 */
export class InMemoryShadow extends PackingShadowLedger {
  readonly orders = new Map<string, ShadowOrderToDraw>();
  readonly receipts = new Map<string, ShadowReceipt>();
  readonly stocks = new Map<string, { received: number; returned: number }>();

  drawOrder(order: ShadowOrderToDraw): Promise<void> {
    const key = `${order.serviceDay}/${order.orderId}`;
    if (!this.orders.has(key)) {
      this.orders.set(key, order);
    }
    return Promise.resolve();
  }

  receive(receipt: ShadowReceipt): Promise<boolean> {
    if (this.receipts.has(receipt.id)) {
      return Promise.resolve(false);
    }
    this.receipts.set(receipt.id, receipt);
    const key = `${receipt.serviceDay}/${receipt.sku}`;
    const stock = this.stocks.get(key) ?? { received: 0, returned: 0 };
    this.stocks.set(
      key,
      receipt.kind === "handoff"
        ? { ...stock, received: stock.received + receipt.quantity }
        : { ...stock, returned: stock.returned + receipt.quantity },
    );
    return Promise.resolve(true);
  }

  /** La réserve d'un article, ou `undefined` si rien n'y est jamais arrivé. */
  stockOf(serviceDay: string, sku: string): { received: number; returned: number } | undefined {
    return this.stocks.get(`${serviceDay}/${sku}`);
  }
}

/** La lecture de l'ombre, adossée au même état. */
export class InMemoryShadowReader extends PackingShadowReader {
  constructor(private readonly shadow: InMemoryShadow) {
    super();
  }

  dayOf(serviceDay: string): Promise<ShadowDay> {
    const orders = [...this.shadow.orders.values()].filter(
      (order) => order.serviceDay === serviceDay,
    );
    const stocks: ShadowStock[] = [...this.shadow.stocks.entries()]
      .filter(([key]) => key.startsWith(`${serviceDay}/`))
      .map(([key, stock]) => ({ sku: key.slice(serviceDay.length + 1), ...stock, packed: 0 }));
    return Promise.resolve({ orders, stocks });
  }
}
