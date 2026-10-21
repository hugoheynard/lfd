import type {
  ProductionBatchSnapshot,
  ProductionResupplySnapshot,
} from "../../entities/production-day.snapshot.js";
import { handedQuantityOf, handedShareOf, onSiteShareOf } from "../on-site-share.js";

/**
 * **Ce qui part au colisage, et ce qui monte directement** (réassort, R3c,
 * décision 3) — la part d'un réassort servi sur place n'est pas remise.
 *
 * Instants recopiés, jamais comparés à l'horloge.
 */
const AT = new Date("2026-09-13T05:10:00.000Z");
const SKU = "VIE-001";

function resupply(servedByTransfer: boolean, quantity: number): ProductionResupplySnapshot {
  return {
    resupplyId: servedByTransfer ? "res_village" : "res_labo",
    siteId: servedByTransfer ? "village" : "labo",
    siteLabel: null,
    name: null,
    servedByTransfer,
    lines: [{ sku: SKU, productName: "Croissant", quantity }],
  };
}

function batch(id: string, quantity: number, extra: Partial<ProductionBatchSnapshot> = {}) {
  const snapshot: ProductionBatchSnapshot = {
    id,
    sku: SKU,
    quantity,
    recorded: { at: AT, by: "staff-1", initials: "MB" },
    cancelled: null,
    returned: 0,
    pendingReturn: 0,
    ...extra,
  };
  return snapshot;
}

describe("la part servie sur place", () => {
  it("ne compte que les réassorts d'un point qui n'est pas servi par transfert", () => {
    expect(onSiteShareOf([resupply(true, 6), resupply(false, 4)], SKU)).toBe(4);
    expect(onSiteShareOf([resupply(false, 4)], "AUTRE")).toBe(0);
  });

  it("le colisage d'abord, puis le point sur place, puis le surplus au colisage", () => {
    // 30 au compte, dont 10 sur place : 20 pour le colisage.
    const first = handedQuantityOf({ counted: 30, onSite: 10, earlier: [], quantity: 24 });
    expect(first).toBe(20);
    const second = handedQuantityOf({
      counted: 30,
      onSite: 10,
      earlier: [{ quantity: 24, handed: 20, returned: 0 }],
      quantity: 10,
    });
    // 6 restent à garder ; les 4 au-delà du compte vont au colisage.
    expect(second).toBe(4);
  });

  it("une fournée entièrement pour le point sur place n'est pas remise du tout", () => {
    expect(
      handedQuantityOf({
        counted: 30,
        onSite: 10,
        earlier: [{ quantity: 20, handed: 20, returned: 0 }],
        quantity: 10,
      }),
    ).toBe(0);
  });

  it("un retour du colisage ne change pas la part gardée", () => {
    // 20 remis, 5 rendus : le colisage attend encore 5, rien n'est gardé.
    expect(
      handedQuantityOf({
        counted: 30,
        onSite: 10,
        earlier: [{ quantity: 20, handed: 20, returned: 5 }],
        quantity: 5,
      }),
    ).toBe(5);
  });

  it("sans réassort sur place, la fournée entière est remise", () => {
    const day = { counts: [], resupplies: [resupply(true, 6)], batches: [] };
    expect(handedShareOf(day, batch("b1", 12), new Map())).toBe(12);
  });

  it("les fournées annulées sortent du calcul avec leur part", () => {
    const day = {
      counts: [{ sku: SKU, productName: "Croissant", quantity: 14, done: null }],
      resupplies: [resupply(false, 4)],
      batches: [batch("b0", 14, { cancelled: { at: AT, by: "staff-1" } })],
    };
    expect(handedShareOf(day, batch("b1", 14), new Map([["b0", 10]]))).toBe(10);
  });
});
