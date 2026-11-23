import type { IssuedCreditNote } from "../../../../accounting/domain/ports/issued-credit-notes.reader.js";
import { TooLongSalesPeriodError } from "../../../domain/errors/sales-period-errors.js";
import { aLine, anOrder } from "./sales-export.doubles.js";
import { DAY, NEXT_DAY, dayOf, sceneOf } from "./sales-export.scene.js";

describe("GetSalesExportHandler — le résumé (§ 3.5)", () => {
  it("sert un jour sans vente à zéro", async () => {
    const view = await sceneOf({ orders: [anOrder()] }).run();

    expect(view.summary.map((line) => line.day)).toEqual([DAY, NEXT_DAY]);
    expect(dayOf(view, NEXT_DAY)).toMatchObject({
      orders: 0,
      revenueHt: 0,
      vat: 0,
      revenueTtc: 0,
      vatByRate: [],
      netRevenueTtc: 0,
      byClientele: { pro: { orders: 0 }, public: { orders: 0 }, unknown: { orders: 0 } },
    });
  });

  it("laisse une commande réglée à la caisse de la boutique hors du total", async () => {
    const shopTill = anOrder({
      orderId: "o2",
      orderNumber: "C-0002",
      clientele: "public",
      settlementVenue: "shop_till",
      countsAsRevenue: false,
    });

    const view = await sceneOf({ orders: [anOrder(), shopTill] }).run();

    expect(view.orders).toHaveLength(2);
    expect(dayOf(view, DAY)).toMatchObject({ orders: 1, revenueTtc: 10.55 });
    expect(dayOf(view, DAY)?.byClientele.public.orders).toBe(0);
  });

  it("somme les commandes, jamais les lignes", async () => {
    // Une remise de panier vit sur la commande : la somme des lignes (20 €) n'est pas son HT (18 €).
    const discounted = anOrder({
      lines: [aLine(), aLine({ sku: "VIE-002-1" })],
      amounts: {
        ...anOrder().amounts,
        subtotalCents: 2000,
        discountCents: 200,
        vatCents: 99,
        vatShares: [{ rate: 5.5, amountCents: 99 }],
        totalCents: 1899,
      },
    });

    const view = await sceneOf({ orders: [discounted] }).run();

    expect(view.lines.reduce((sum, line) => sum + line.lineHt, 0)).toBe(20);
    expect(dayOf(view, DAY)).toMatchObject({ revenueHt: 18, vat: 0.99, revenueTtc: 18.99 });
  });

  it("sert le HT total et le HT marchandises, qui diffèrent du port et de la pénalité", async () => {
    const withFees = anOrder({
      clientele: "public",
      amounts: {
        ...anOrder().amounts,
        subtotalCents: 1200,
        discountCents: 100,
        voucherDiscountCents: 100,
        deliveryFeeCents: 300,
        lateFeeCents: 200,
        vatCents: 83,
        vatShares: null,
        totalCents: 1583,
      },
    });

    const view = await sceneOf({ orders: [withFees] }).run();

    expect(view.orders[0]).toMatchObject({ totalHt: 15, goodsHt: 10, totalTtc: 15.83 });
    expect(dayOf(view, DAY)).toMatchObject({ revenueHt: 15, goodsHt: 10 });
    expect(dayOf(view, DAY)?.byClientele.public).toMatchObject({ revenueHt: 15, goodsHt: 10 });
  });

  it("range les avoirs à leur jour d'émission et les nomme par l'enseigne", async () => {
    const note: IssuedCreditNote = {
      number: "AV-0001",
      issuedOn: NEXT_DAY,
      payerCompanyId: "co2",
      totalHtCents: 500,
      totalVatCents: 28,
      totalTtcCents: 528,
      orderNumbers: ["C-0001"],
    };

    const view = await sceneOf({ orders: [anOrder()], notes: [note] }).run();

    expect(view.creditNotes).toEqual([
      {
        number: "AV-0001",
        issuedOn: NEXT_DAY,
        companyName: "Le Bistrot",
        ht: 5,
        vat: 0.28,
        ttc: 5.28,
        orderNumbers: ["C-0001"],
      },
    ]);
    expect(dayOf(view, DAY)).toMatchObject({ creditNotesTtc: 0, revenueTtc: 10.55 });
    expect(dayOf(view, NEXT_DAY)).toMatchObject({
      creditNotesHt: 5,
      creditNotesTtc: 5.28,
      revenueTtc: 0,
    });
  });
});

describe("GetSalesExportHandler — les lectures", () => {
  it("appelle chaque lecture une seule fois, par lot, quel que soit le nombre de commandes", async () => {
    const orders = ["o1", "o2", "o3"].map((orderId, index) =>
      anOrder({
        orderId,
        orderNumber: `C-000${String(index)}`,
        companyId: index === 2 ? null : "co1",
      }),
    );
    const { readers, run } = sceneOf({ orders });

    await run();

    expect(readers.sales.calls).toEqual([[DAY, NEXT_DAY]]);
    expect(readers.notes.calls).toEqual([[DAY, NEXT_DAY]]);
    expect(readers.names.calls).toEqual([["cat-viennoiserie"]]);
    expect(readers.companies.calls).toEqual([["co1"]]);
    expect(readers.refunds.calls).toEqual([["order", ["o1", "o2", "o3"]]]);
  });

  it("refuse une période trop longue avant toute lecture", async () => {
    const { readers, run } = sceneOf({ orders: [anOrder()] });

    await expect(run("2026-03-01", "2026-04-01")).rejects.toBeInstanceOf(TooLongSalesPeriodError);
    expect(readers.sales.calls).toEqual([]);
  });
});
