import { aLine, anOrder } from "./sales-export.doubles.js";
import { DAY, dayOf, refund, sceneOf } from "./sales-export.scene.js";

describe("GetSalesExportHandler — les commandes et les lignes", () => {
  it("convertit les centimes en euros et date à Paris, à la minute", async () => {
    const view = await sceneOf({ orders: [anOrder()] }).run();

    expect(view.orders[0]).toMatchObject({
      orderNumber: "C-0001",
      placedAt: "2026-03-10T09:41:00+01:00",
      subtotalHt: 10,
      totalHt: 10,
      vat: 0.55,
      totalTtc: 10.55,
      vatByRate: [{ rate: 5.5, ht: null, vat: 0.55, ttc: null }],
      companyName: "Hôtel du Parc",
      nafCode: "55.10Z",
      refunds: [],
      returnRefundedTtc: 0,
    });
    expect(view.lines[0]).toMatchObject({
      orderNumber: "C-0001",
      article: "Viennoise",
      family: "Viennoiserie",
      unitPriceHt: 1,
      lineHt: 10,
    });
  });

  it("garde les null tels quels, jamais un zéro ni une chaîne vide", async () => {
    const order = anOrder({
      receivedOn: null,
      companyId: "co2",
      amounts: { ...anOrder().amounts, vatShares: null },
      lines: [
        aLine({ categoryId: null, lineTotalTtcCents: null }),
        aLine({ sku: "X", categoryId: "cat-retiree" }),
      ],
    });

    const view = await sceneOf({ orders: [order] }).run();

    expect(view.orders[0]).toMatchObject({
      receivedOn: null,
      cancelledAt: null,
      settlementVenue: null,
      offeredTtc: null,
      vatByRate: null,
      settled: null,
      nafCode: null,
    });
    expect(view.lines.map((line) => [line.familyId, line.family, line.lineTtc])).toEqual([
      [null, null, null],
      ["cat-retiree", null, null],
    ]);
    expect(dayOf(view, DAY)?.vatByRate).toBeNull();
  });

  it("ne nomme aucune société pour un particulier, même s'il en porte une", async () => {
    const { readers, run } = sceneOf({
      orders: [anOrder({ clientele: "public", companyId: "co1" })],
    });

    const view = await run();

    expect(view.orders[0]).toMatchObject({ companyName: null, nafCode: null });
    expect(readers.companies.calls).toEqual([[]]);
  });

  it("sert une commande offerte avec sa valeur, hors du CA", async () => {
    const offered = anOrder({
      offered: true,
      countsAsRevenue: false,
      offeredTotalCents: 2110,
      amounts: { ...anOrder().amounts, vatCents: 0, vatShares: [], totalCents: 0 },
    });

    const view = await sceneOf({ orders: [offered] }).run();

    expect(view.orders[0]).toMatchObject({ offered: true, offeredTtc: 21.1, totalTtc: 0 });
    expect(dayOf(view, DAY)).toMatchObject({ orders: 0, revenueTtc: 0 });
  });

  it("garde les cinq décimales du prix au kilo d'une vente au poids", async () => {
    const weighed = aLine({ saleUnit: "weight", quantity: 1250, unitPriceMillicents: 1_234_567 });

    const view = await sceneOf({ orders: [anOrder({ lines: [weighed] })] }).run();

    expect(view.lines[0]).toMatchObject({
      saleUnit: "weight",
      quantity: 1250,
      unitPriceHt: 12.34567,
    });
  });

  it("sert le HT, la TVA et le TTC par taux d'une commande composée en TTC", async () => {
    const exact = anOrder({
      vatMethod: "exact_ht",
      ttcByRate: [{ rate: 5.5, htCents: 1000, vatCents: 55, ttcCents: 1055 }],
    });

    const view = await sceneOf({ orders: [exact] }).run();

    expect(view.orders[0]?.vatByRate).toEqual([{ rate: 5.5, ht: 10, vat: 0.55, ttc: 10.55 }]);
  });
});

describe("GetSalesExportHandler — les remboursements (§ 5)", () => {
  it("détaille chaque remboursement et ne déduit que les return d'une commande qui compte", async () => {
    const view = await sceneOf({
      orders: [anOrder()],
      refunds: [
        refund("o1", 300, "return"),
        refund("o1", 200, "adjustment"),
        refund("o1", 100, null),
      ],
    }).run();

    expect(view.orders[0]?.refunds).toEqual([
      { refundedAt: "2026-03-12T11:00:00+01:00", amountTtc: 3, nature: "return" },
      { refundedAt: "2026-03-12T11:00:00+01:00", amountTtc: 2, nature: "adjustment" },
      { refundedAt: "2026-03-12T11:00:00+01:00", amountTtc: 1, nature: null },
    ]);
    expect(view.orders[0]?.returnRefundedTtc).toBe(3);
    expect(dayOf(view, DAY)).toMatchObject({ returnRefundedTtc: 3, netRevenueTtc: 7.55 });
  });

  it("ne déduit jamais un ajustement", async () => {
    const view = await sceneOf({
      orders: [anOrder()],
      refunds: [refund("o1", 500, "adjustment")],
    }).run();

    expect(view.orders[0]?.returnRefundedTtc).toBe(0);
    expect(dayOf(view, DAY)?.netRevenueTtc).toBe(10.55);
  });

  it("ne déduit pas le return d'une commande annulée, déjà hors du CA", async () => {
    const cancelled = anOrder({
      status: "cancelled",
      countsAsRevenue: false,
      cancelledAt: new Date("2026-03-10T12:00:00.000Z"),
    });

    const view = await sceneOf({
      orders: [cancelled],
      refunds: [refund("o1", 1055, "return")],
    }).run();

    expect(view.orders[0]).toMatchObject({
      cancelledAt: "2026-03-10T13:00:00+01:00",
      returnRefundedTtc: 0,
    });
    expect(view.orders[0]?.refunds).toHaveLength(1);
    expect(dayOf(view, DAY)).toMatchObject({ orders: 0, returnRefundedTtc: 0 });
  });
});
