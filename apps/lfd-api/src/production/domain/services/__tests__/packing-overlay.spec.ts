import type { ProductionOrderSnapshot } from "../../entities/production-day.snapshot.js";
import { overlaySeals } from "../packing-overlay.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date("2026-09-13T05:10:00.000Z");

function order(
  orderId: string,
  over: Partial<ProductionOrderSnapshot> = {},
): ProductionOrderSnapshot {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    packed: null,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 12 }],
    ...over,
  };
}

describe("overlaySeals — la fermeture du bac, prise au colisage", () => {
  it("pose la fermeture du colisage sur la commande du plan", () => {
    const [sealed] = overlaySeals([order("ord_1")], new Map([["ord_1", { at: AT, by: "s1" }]]));

    expect(sealed?.packed).toEqual({ at: AT, by: "s1" });
    expect(sealed?.lines).toEqual(order("ord_1").lines);
  });

  it("une commande que le colisage ne tient pas fermée se lit ouverte — même marquée avant", () => {
    // Une fermeture déjà posée sur le plan ne compte pas : seul le colisage sait.
    const [open] = overlaySeals([order("ord_2", { packed: { at: AT, by: "fantome" } })], new Map());

    expect(open?.packed).toBeNull();
  });
});
