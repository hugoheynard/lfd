import type {
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "../../entities/production-day.js";
import { countColorSharesOf } from "../count-color-shares.js";

function order(orderId: string, croissants: number): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId,
    rank: 1,
    reference: `REF-${orderId}`,
    customerLabel: "Client",
    fulfillmentMethod: "pickup",
    destination: "Village",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: croissants, saleUnit: "piece" }],
  };
}

const RESUPPLY: ProductionResupplySnapshot = {
  resupplyId: "r-1",
  siteId: "site-v",
  siteLabel: "Village",
  name: null,
  servedByTransfer: false,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 5, saleUnit: "piece" }],
};

describe("countColorSharesOf — la répartition du jour par couleur", () => {
  it("additionne par couleur, la part neutre (sans couleur, réassort) en dernier", () => {
    const shares = countColorSharesOf(
      [order("a", 3), order("b", 4), order("c", 2), order("d", 1)],
      [RESUPPLY],
      new Map([
        ["a", "#e4572e"],
        ["b", "#2e86ab"],
        ["c", "#e4572e"],
      ]),
      new Map(),
    );
    expect(shares).toEqual([
      { color: "#2e86ab", quantity: 4 },
      { color: "#e4572e", quantity: 5 },
      { color: null, quantity: 6 },
    ]);
  });

  it("la somme des parts est le total de pièces du compte : rien ne se perd ni ne s'invente", () => {
    const shares = countColorSharesOf(
      [order("a", 3)],
      [RESUPPLY],
      new Map(),
      new Map([["site-v", "#26a69a"]]),
    );
    const total = shares.reduce((sum, share) => sum + share.quantity, 0);
    expect(total).toBe(8);
  });

  it("sans commande ni réassort, aucune part", () => {
    expect(countColorSharesOf([], [], new Map(), new Map())).toEqual([]);
  });

  it("un réassort prend la teinte de réassort de son site (Hugo, 2026-10-22)", () => {
    const shares = countColorSharesOf(
      [order("a", 3), order("d", 1)],
      [RESUPPLY, { ...RESUPPLY, resupplyId: "r-2", siteId: "site-sans-teinte" }],
      new Map([["a", "#e4572e"]]),
      new Map([["site-v", "#26a69a"]]),
    );
    expect(shares).toEqual([
      { color: "#26a69a", quantity: 5 },
      { color: "#e4572e", quantity: 3 },
      { color: null, quantity: 6 },
    ]);
  });

  it("la teinte de réassort ne peint jamais une commande, même du même site", () => {
    const shares = countColorSharesOf(
      [{ ...order("a", 2), siteId: "site-v" }],
      [],
      new Map(),
      new Map([["site-v", "#26a69a"]]),
    );
    expect(shares).toEqual([{ color: null, quantity: 2 }]);
  });
});
