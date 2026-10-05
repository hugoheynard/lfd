import {
  PackedOrdersReader,
  type PackedOrderSeal,
} from "../../channels/packing/packed-orders.reader.js";
import { ProductionDay } from "../../domain/entities/production-day.js";

/**
 * La même journée, arrêtée avant la bascule (`legacy`) : depuis K2, une clôture
 * écrit toujours `packing`, et une journée `legacy` ne se relit que de la base.
 * Ses fournées s'annulent encore tout de suite (K2) ; son colisage, lui, n'est
 * plus servi (K3c).
 */
export function legacyOf(day: ProductionDay): ProductionDay {
  return ProductionDay.fromSnapshot({ ...day.toSnapshot(), packingOwner: "legacy" });
}

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
