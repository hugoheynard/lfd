import { type ReceivableResupply, ResupplyReceipt } from "../resupply-receipt.js";
import { ResupplyReceiptLine } from "../resupply-receipt-line.js";

/** Le banc du reçu, partagé par ses specs (découpées le 2026-11-03). */

export const DAY = "2026-01-02";
/** 9 h à Paris le jour du réassort : seules des dates comparées entre elles. */
export const MORNING = new Date("2026-01-02T08:00:00Z");
export const TRACE = {
  at: MORNING,
  author: { staffUserId: "staff_1", name: "Lou", role: "counter" },
};
export const LATER = {
  at: new Date(MORNING.getTime() + 60_000),
  author: { staffUserId: "staff_2", name: "Max", role: "counter" },
};

export const RESUPPLY: ReceivableResupply = {
  id: "resupply_1",
  siteId: "site_1",
  serviceDay: DAY,
  lines: [
    { sku: "CRO", label: "Croissant", quantity: 24, saleUnit: "piece" as const },
    { sku: "PAC", label: "Pain au chocolat", quantity: 12, saleUnit: "piece" as const },
  ],
};

export function unorderedLine(sku: string, quantity: number): ResupplyReceiptLine {
  return ResupplyReceiptLine.unordered({
    sku,
    label: `Article ${sku}`,
    quantity,
    saleUnit: "piece",
  });
}

export function unordered(): ResupplyReceipt {
  return ResupplyReceipt.openUnordered({ id: "u1", siteId: "site_1", serviceDay: DAY });
}

export function expecting(resupply: ReceivableResupply = RESUPPLY): ResupplyReceipt {
  return ResupplyReceipt.expecting(`receipt_${resupply.id}`, resupply);
}
