import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { producibleOrder } from "../../../channels/commerce/__tests__/producible-order.fixture.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay } from "../production-day.js";

/**
 * Ce que les specs de l'agrégat `ProductionDay` partagent — coupé de
 * `production-day.spec.ts` (417 lignes) le 2026-11-03.
 *
 * `AT` et `LATER` sont recopiés dans la journée, jamais comparés à
 * l'horloge : l'agrégat prend ses instants en paramètre.
 */
export const AT = new Date("2026-09-07T18:00:00.000Z");
export const LATER = new Date("2026-09-08T05:30:00.000Z");

/** La commande de référence : `ord_1`, « ORD-0001 », quarante croissants. */
export function order(overrides: Partial<ProducibleOrder> = {}): ProducibleOrder {
  return producibleOrder("ord_1", {
    reference: "ORD-0001",
    customerLabel: "Hôtel des Trois Ponts",
    ...overrides,
  });
}

/** Une journée jamais arrêtée, le 8 septembre. */
export function opened(): ProductionDay {
  return ProductionDay.open(ServiceDay.of("2026-09-08"));
}
