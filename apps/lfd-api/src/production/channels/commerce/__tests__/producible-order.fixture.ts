import type { ProducibleOrder, ProducibleLine } from "../day-orders.reader.js";

/**
 * **Une commande producible, telle que le commerce la rend au fournil** — la
 * fixture que les specs du fournil partagent. Elle était recopiée, champ par
 * champ, dans une douzaine de specs (audit final du réassort, 2026-11-03) :
 * un champ ajouté au port obligeait à toutes les rouvrir, et chacune
 * inventait ses défauts.
 *
 * Défauts : un retrait des « Trois Ponts » au Labo, sans échéance ni
 * clientèle, quarante croissants. Une spec ne dit que ce qui compte pour elle.
 */
export function producibleOrder(
  orderId = "ord_1",
  overrides: Partial<ProducibleOrder> = {},
): ProducibleOrder {
  return {
    orderId,
    reference: `ORD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [orderLine("VIE-001", 40, "Croissant")],
    ...overrides,
  };
}

/** Une ligne à la pièce, sans fabrication à la commande. Le nom vaut le SKU s'il est tu. */
export function orderLine(sku: string, quantity: number, productName = sku): ProducibleLine {
  return { sku, productName, quantity, saleUnit: "piece", madeToOrder: null };
}
