import { PackedOrdersReader, type PackedOrderSeal } from "../packed-orders.reader.js";

/** « Lesquelles sont colisées ? » (K3a) : des bacs fermés fixés d'avance, aucun par défaut. */
export class FixedPackedOrders extends PackedOrdersReader {
  readonly asked: string[] = [];

  constructor(private readonly sealed: ReadonlyMap<string, PackedOrderSeal> = new Map()) {
    super();
  }

  packedOn(serviceDay: string): Promise<ReadonlyMap<string, PackedOrderSeal>> {
    this.asked.push(serviceDay);
    return Promise.resolve(this.sealed);
  }
}

/** Les bacs fermés au colisage de ces commandes, à cet instant — par la même fiche. */
export function sealedAt(at: Date, orderIds: readonly string[]): FixedPackedOrders {
  return new FixedPackedOrders(new Map(orderIds.map((id) => [id, { at, by: "staff_pack" }])));
}
