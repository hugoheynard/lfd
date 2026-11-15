import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

export const CROISSANT = "VIE-001";
export const BAGUETTE = "PAI-001";

/** Deux commandes : l'une porte des croissants, l'autre des croissants ET une baguette. */
export const ORDERS: readonly ProducibleOrder[] = [
  {
    orderId: "ord_1",
    reference: "ORD-0001",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [
      {
        sku: CROISSANT,
        productName: "Croissant",
        quantity: 12,
        saleUnit: "piece",
        madeToOrder: null,
      },
    ],
  },
  {
    orderId: "ord_2",
    reference: "ORD-0002",
    customerLabel: "Le Chalet",
    fulfillmentMethod: "delivery",
    destination: "Val d'Isère",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [
      {
        sku: CROISSANT,
        productName: "Croissant",
        quantity: 4,
        saleUnit: "piece",
        madeToOrder: null,
      },
      { sku: BAGUETTE, productName: "Baguette", quantity: 2, saleUnit: "piece", madeToOrder: null },
    ],
  },
];

/** Une journée arrêtée ; `packed` : les commandes dont le bac est fermé. */
export function closedDay(day: ServiceDay, at: Date, packed: readonly string[]): ProductionDay {
  const open = ProductionDay.open(day);
  open.close(ORDERS, new Set<string>(), at, null);
  const snapshot = open.toSnapshot();
  return ProductionDay.fromSnapshot({
    ...snapshot,
    // Le bac fermé est écrit au FOURNIL : une journée de l'ancien poste (K2).
    packingOwner: "legacy",
    orders: snapshot.orders.map((order) =>
      packed.includes(order.orderId) ? { ...order, packed: { at, by: "staff_pack" } } : order,
    ),
  });
}

/** La même journée, colisée au poste du colisage (K3a). */
export function packingDay(day: ProductionDay): ProductionDay {
  return ProductionDay.fromSnapshot({ ...day.toSnapshot(), packingOwner: "packing" });
}

export class FixedDays extends ProductionDayRepository {
  constructor(public current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  /** Non utilisés par le contrôle qualité : rejeter plutôt que rendre muet. */
  save(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
}
