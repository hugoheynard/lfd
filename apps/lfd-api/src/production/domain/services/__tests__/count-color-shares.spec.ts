import type {
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "../../entities/production-day.js";
import { countColorSharesOf } from "../count-color-shares.js";

function order(orderId: string, croissants: number): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId,
    reference: `REF-${orderId}`,
    customerLabel: "Client",
    fulfillmentMethod: "pickup",
    destination: "Village",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: croissants }],
  };
}

const RESUPPLY: ProductionResupplySnapshot = {
  resupplyId: "r-1",
  siteId: "site-v",
  siteLabel: "Village",
  name: null,
  servedByTransfer: false,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 5 }],
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
    );
    expect(shares).toEqual([
      { color: "#2e86ab", quantity: 4 },
      { color: "#e4572e", quantity: 5 },
      { color: null, quantity: 6 },
    ]);
  });

  it("la somme des parts est le total de pièces du compte : rien ne se perd ni ne s'invente", () => {
    const shares = countColorSharesOf([order("a", 3)], [RESUPPLY], new Map());
    const total = shares.reduce((sum, share) => sum + share.quantity, 0);
    expect(total).toBe(8);
  });

  it("sans commande ni réassort, aucune part", () => {
    expect(countColorSharesOf([], [], new Map())).toEqual([]);
  });
});
