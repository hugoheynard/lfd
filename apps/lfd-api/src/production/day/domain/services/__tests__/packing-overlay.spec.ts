import type { ProductionOrderSnapshot } from "../../entities/production-day.snapshot.js";
import { ProductionDay } from "../../entities/production-day.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { overlaySeals, withSeals } from "../packing-overlay.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date("2026-09-13T05:10:00.000Z");

function order(
  orderId: string,
  over: Partial<ProductionOrderSnapshot> = {},
): ProductionOrderSnapshot {
  return {
    orderId,
    rank: 1,
    reference: `ORD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    packed: null,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 12, saleUnit: "piece" }],
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

describe("withSeals — la journée rendue avec les fermetures du colisage", () => {
  it("pose les fermetures sur les commandes de la journée, sans toucher au dépôt", () => {
    const day = ProductionDay.fromSnapshot({
      ...ProductionDay.open(ServiceDay.of("2030-03-12")).toSnapshot(),
      orders: [order("ord_1"), order("ord_2", { packed: { at: AT, by: "fantome" } })],
    });

    const sealed = withSeals(day, new Map([["ord_1", { at: AT, by: "s1" }]]));

    expect(sealed.orders.map((o) => o.packed)).toEqual([{ at: AT, by: "s1" }, null]);
    // La journée lue n'est pas mutée : c'est une autre instance.
    expect(day.orders[1]?.packed).toEqual({ at: AT, by: "fantome" });
  });
});
