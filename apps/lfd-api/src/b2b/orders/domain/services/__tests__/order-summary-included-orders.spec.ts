import { orderPretaxCents } from "../order-pretax.js";
import { summarizeOrders, type OrderSummarySource } from "../order-summary.js";
import { authorLabel, orderDayLabel, ordersGapLabel } from "../order-summary-orders.js";

/**
 * Les bons de commande inclus du récapitulatif (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §10) : un bon
 * par commande COMPTÉE, au « Total HT » que son bon imprime (F5), et la somme
 * rapprochée du sous-total HT — l'écart dit, jamais muet.
 *
 * Les jours ne sont comparés qu'entre eux (tri) : rien n'interroge l'horloge.
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
    lines: [{ sku: "VIE-001", name: "Croissant", quantity: 10, lineTotalCents: 1_000 }],
    ...over,
  };
}

describe("orderPretaxCents — le HT du bon (F5)", () => {
  it("articles moins remises, plus livraison et surtaxe", () => {
    expect(
      orderPretaxCents({
        subtotalCents: 2_000,
        discountCents: 200,
        voucherDiscountCents: 100,
        deliveryFeeCents: 500,
        lateFeeCents: 300,
      }),
    ).toBe(2_500);
  });

  it("une remise plus grande que les articles s'arrête à zéro ; le port s'ajoute ensuite", () => {
    expect(
      orderPretaxCents({
        subtotalCents: 300,
        discountCents: 500,
        voucherDiscountCents: 0,
        deliveryFeeCents: 400,
        lateFeeCents: 0,
      }),
    ).toBe(400);
  });
});

describe("summarizeOrders — les bons inclus (§10)", () => {
  it("une ligne par commande comptée, sans les exclues, avec jour, mode, auteur et HT du bon", () => {
    const summary = summarizeOrders(PRINCIPAL, [
      order({
        id: "livree",
        fulfillmentMethod: "delivery",
        deliveryFeeCents: 800,
        author: { kind: "team" },
      }),
      order({ id: "annulee", cancelled: true }),
    ]);

    expect(summary.companies[0]?.orders).toEqual([
      {
        orderId: "livree",
        orderNumber: "ORD-livree",
        day: "2026-10-07",
        fulfillmentMethod: "delivery",
        author: { kind: "team" },
        pretaxCents: 1_800,
      },
    ]);
  });

  it("par jour croissant, les commandes sans date en dernier, puis la référence", () => {
    const summary = summarizeOrders(PRINCIPAL, [
      order({ id: "c", day: null }),
      order({ id: "b", day: "2026-10-09" }),
      order({ id: "a2", day: "2026-10-08" }),
      order({ id: "a10", day: "2026-10-08" }),
    ]);

    expect(summary.companies[0]?.orders.map((o) => o.orderId)).toEqual(["a2", "a10", "b", "c"]);
  });

  it("chaque société porte SES bons, dans l'ordre des tables", () => {
    const summary = summarizeOrders(PRINCIPAL, [
      order({ id: "site", companyId: "co_site", companyName: "Atelier" }),
      order({ id: "mere" }),
    ]);

    expect(summary.companies.map((c) => c.orders.map((o) => o.orderId))).toEqual([
      ["mere"],
      ["site"],
    ]);
  });

  it("sans geste, la somme des bons EST le sous-total HT : aucun écart", () => {
    const { ordersPretax } = summarizeOrders(PRINCIPAL, [order({ id: "o1" })]).total;

    expect(ordersPretax).toEqual({ pretaxCents: 1_000, gapCents: 0, cappedDiscountCents: 0 });
  });

  it("remise et livraison : l'écart est celui des gestes du bas", () => {
    const table = summarizeOrders(PRINCIPAL, [
      order({ id: "o1", discountCents: 150, deliveryFeeCents: 800 }),
      order({ id: "o2", lateFeeCents: 200 }),
    ]).total;

    expect(table.ordersPretax).toEqual({
      pretaxCents: 2_850,
      gapCents: 850,
      cappedDiscountCents: 0,
    });
    expect(ordersGapLabel(table.bottom, table.ordersPretax)).toBe(
      "Écart avec le sous-total HT : remises, livraison, surtaxes de commande tardive",
    );
  });

  it("une remise plafonnée par le bon est dite à part, pas fondue dans les remises", () => {
    const table = summarizeOrders(PRINCIPAL, [
      order({ id: "o1", subtotalCents: 300, discountCents: 500, lines: [] }),
    ]).total;

    expect(table.ordersPretax).toEqual({
      pretaxCents: 0,
      gapCents: -300,
      cappedDiscountCents: 200,
    });
    expect(ordersGapLabel(table.bottom, table.ordersPretax)).toBe(
      "Écart avec le sous-total HT : remises, remise plafonnée au montant des articles",
    );
  });
});

describe("les mots des bons", () => {
  it("l'auteur : le nom du client, ou l'équipe", () => {
    expect(authorLabel({ kind: "customer", name: "Léa Martin" })).toBe("Léa Martin");
    expect(authorLabel({ kind: "team" })).toBe("l'équipe");
  });

  it("le jour, court, avec l'année ; « sans date » sinon", () => {
    expect(orderDayLabel("2026-10-07")).toBe("mer. 7 oct. 2026");
    expect(orderDayLabel(null)).toBe("sans date");
  });

  it("aucune ligne d'écart quand il n'y en a pas", () => {
    const table = summarizeOrders(PRINCIPAL, [order({ id: "o1" })]).total;

    expect(ordersGapLabel(table.bottom, table.ordersPretax)).toBeNull();
  });
});
