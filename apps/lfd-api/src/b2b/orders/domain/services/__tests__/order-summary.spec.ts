import { ORDER_SUMMARY_MAX_ORDERS } from "@lfd/contracts";

import {
  OrderSummaryOrdersNotFoundError,
  OrderSummaryTooManyOrdersError,
} from "../../errors/order-summary-errors.js";
import {
  ensureAllSummarized,
  summarizeOrders,
  summarySelectionOf,
  type OrderSummarySource,
} from "../order-summary.js";

/**
 * Le récapitulatif de commandes (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §6) : le bas
 * est la SOMME des colonnes des commandes, au centime.
 */
const PRINCIPAL = "co_principal";

function order(over: Partial<OrderSummarySource> & { readonly id: string }): OrderSummarySource {
  return {
    orderNumber: `ORD-${over.id}`,
    companyId: PRINCIPAL,
    companyName: "Maison mère",
    day: "2026-10-07",
    fulfillmentMethod: "pickup",
    author: { kind: "customer", name: "Léa Martin" },
    cancelled: false,
    paymentStatus: "not_required",
    subtotalCents: 1_000,
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    vatCents: 55,
    vatShares: [{ rate: 5.5, amountCents: 55 }],
    totalCents: 1_055,
    lines: [
      { sku: "VIE-001", name: "Croissant", quantity: 10, saleUnit: "piece", lineTotalCents: 1_000 },
    ],
    ...over,
  };
}

describe("summarizeOrders — par produit", () => {
  it("un SKU vendu à deux prix reste UNE ligne : quantités et HT sommés", () => {
    const summary = summarizeOrders(PRINCIPAL, [
      order({
        id: "o1",
        lines: [
          {
            sku: "VIE-001",
            name: "Croissant beurre",
            quantity: 10,
            saleUnit: "piece",
            lineTotalCents: 1_000,
          },
        ],
      }),
      order({
        id: "o2",
        lines: [
          {
            sku: "VIE-001",
            name: "Croissant",
            quantity: 4,
            saleUnit: "piece",
            lineTotalCents: 480,
          },
        ],
      }),
    ]);

    expect(summary.total.products).toEqual([
      { sku: "VIE-001", name: "Croissant beurre", quantity: 14, saleUnit: "piece", htCents: 1_480 },
    ]);
  });

  /** P5 (`plan-vente-au-poids.md`) : la quantité sommée d'un article au poids est en grammes. */
  it("un article au poids somme ses grammes, et le dit", () => {
    const salmon = { sku: "SAU-001", name: "Gravlax", saleUnit: "weight" as const };
    const summary = summarizeOrders(PRINCIPAL, [
      order({ id: "o1", lines: [{ ...salmon, quantity: 500, lineTotalCents: 1_000 }] }),
      order({ id: "o2", lines: [{ ...salmon, quantity: 750, lineTotalCents: 1_500 }] }),
    ]);

    expect(summary.total.products).toEqual([
      { sku: "SAU-001", name: "Gravlax", quantity: 1_250, saleUnit: "weight", htCents: 2_500 },
    ]);
  });

  it("trie les produits par nom", () => {
    const summary = summarizeOrders(PRINCIPAL, [
      order({
        id: "o1",
        lines: [
          {
            sku: "PAI-002",
            name: "Pain de mie",
            quantity: 1,
            saleUnit: "piece",
            lineTotalCents: 300,
          },
          { sku: "BAG-001", name: "Baguette", quantity: 2, saleUnit: "piece", lineTotalCents: 200 },
        ],
      }),
    ]);

    expect(summary.total.products.map((p) => p.sku)).toEqual(["BAG-001", "PAI-002"]);
  });
});

describe("summarizeOrders — le bas, comme une facture (§6.1)", () => {
  const first = order({
    id: "o1",
    subtotalCents: 2_000,
    discountCents: 200,
    voucherDiscountCents: 100,
    deliveryFeeCents: 500,
    lateFeeCents: 300,
    vatCents: 287,
    vatShares: [
      { rate: 5.5, amountCents: 93 },
      { rate: 20, amountCents: 194 },
    ],
    totalCents: 2_787,
  });
  const second = order({
    id: "o2",
    subtotalCents: 1_001,
    discountCents: 0,
    deliveryFeeCents: 500,
    vatCents: 155,
    vatShares: [
      { rate: 20, amountCents: 100 },
      { rate: 5.5, amountCents: 55 },
    ],
    totalCents: 1_656,
  });

  it("chaque ligne du bas est la somme de la colonne des commandes, TVA par taux croissant", () => {
    const { bottom } = summarizeOrders(PRINCIPAL, [first, second]).total;

    expect(bottom).toEqual({
      subtotalCents: 3_001,
      discountCents: 200,
      voucherDiscountCents: 100,
      deliveryFeeCents: 1_000,
      lateFeeCents: 300,
      vat: [
        { rate: 5.5, amountCents: 148 },
        { rate: 20, amountCents: 294 },
      ],
      unventilatedVatCents: 0,
      totalCents: 4_443,
    });
  });

  it("le TTC est la somme des totaux des commandes, au centime — aucun recalcul", () => {
    const { bottom } = summarizeOrders(PRINCIPAL, [first, second]).total;

    expect(bottom.totalCents).toBe(first.totalCents + second.totalCents);
  });

  it("une commande sans ventilation : sa TVA est sommée à part, sans taux inventé", () => {
    const { bottom } = summarizeOrders(PRINCIPAL, [
      first,
      order({ id: "o3", vatCents: 42, vatShares: null }),
    ]).total;

    expect(bottom.vat).toEqual(first.vatShares);
    expect(bottom.unventilatedVatCents).toBe(42);
  });

  it("dit que les montants sont ceux de la commande (§6.4)", () => {
    expect(summarizeOrders(PRINCIPAL, [first]).amountsAt).toBe("placement");
  });
});

describe("summarizeOrders — une table par société (§6.2)", () => {
  const sources = [
    order({ id: "s1", companyId: "co_z", companyName: "Zénith", totalCents: 100 }),
    order({ id: "p1", totalCents: 200 }),
    order({ id: "s2", companyId: "co_a", companyName: "Atelier", totalCents: 300 }),
    order({ id: "s3", companyId: "co_z", companyName: "Zénith", totalCents: 400 }),
  ];

  it("la société listée d'abord, puis les sites par nom", () => {
    const summary = summarizeOrders(PRINCIPAL, sources);

    expect(summary.companies.map((c) => [c.companyId, c.orderCount, c.bottom.totalCents])).toEqual([
      [PRINCIPAL, 1, 200],
      ["co_a", 1, 300],
      ["co_z", 2, 500],
    ]);
  });

  it("le total général est la somme des tables", () => {
    const summary = summarizeOrders(PRINCIPAL, sources);

    expect(summary.total.orderCount).toBe(4);
    expect(summary.total.bottom.totalCents).toBe(1_000);
    expect(summary.total.products).toEqual([
      { sku: "VIE-001", name: "Croissant", quantity: 40, saleUnit: "piece", htCents: 4_000 },
    ]);
  });
});

describe("summarizeOrders — exclues et listées (§6.5)", () => {
  it("annulée, paiement en attente ou refusé : hors des totaux, nommées", () => {
    const summary = summarizeOrders(PRINCIPAL, [
      order({ id: "ok", paymentStatus: "paid" }),
      order({ id: "annulee", cancelled: true, paymentStatus: "refunded" }),
      order({ id: "attente", paymentStatus: "pending" }),
      order({ id: "refuse", companyId: "co_site", companyName: "Site", paymentStatus: "failed" }),
    ]);

    expect(summary.excluded).toEqual([
      { orderId: "annulee", orderNumber: "ORD-annulee", reason: "cancelled" },
      { orderId: "attente", orderNumber: "ORD-attente", reason: "payment_pending" },
      { orderId: "refuse", orderNumber: "ORD-refuse", reason: "payment_failed" },
    ]);
    expect(summary.total.orderCount).toBe(1);
    expect(summary.total.bottom.totalCents).toBe(1_055);
    expect(summary.companies.map((c) => c.companyId)).toEqual([PRINCIPAL]);
  });
});

describe("summarySelectionOf — le plafond", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `o${i}`);

  it("accepte le plafond exact, sans doublon", () => {
    expect(summarySelectionOf([...ids(ORDER_SUMMARY_MAX_ORDERS), "o0"])).toHaveLength(
      ORDER_SUMMARY_MAX_ORDERS,
    );
  });

  it("refuse au-delà, en nommant le nombre", () => {
    expect(() => summarySelectionOf(ids(ORDER_SUMMARY_MAX_ORDERS + 1))).toThrow(
      OrderSummaryTooManyOrdersError,
    );
  });
});

describe("ensureAllSummarized", () => {
  it("nomme les ids absents de la lecture", () => {
    expect(() => ensureAllSummarized(["o1", "o2"], [order({ id: "o1" })])).toThrow(
      new OrderSummaryOrdersNotFoundError(["o2"]),
    );
  });

  it("se tait quand tout est lu", () => {
    expect(() => ensureAllSummarized(["o1"], [order({ id: "o1" })])).not.toThrow();
  });
});
