import { Prisma } from "../../../../platform/database/client/client.js";
import { salesExportOrderOf, type SalesExportOrderRow } from "../sales-export.rows.js";

const PLACED_AT = new Date("2026-03-10T08:31:00.000Z");

/** Une commande pro au compte, retirée, une ligne couverte par une remise. */
const ROW: SalesExportOrderRow = {
  id: "o1",
  orderNumber: "C-0001",
  createdAt: PLACED_AT,
  receivedOn: new Date("2026-03-12T00:00:00.000Z"),
  status: "fulfilled",
  cancelledAt: null,
  paymentStatus: "not_required",
  settlementVenue: null,
  offerNature: null,
  offeredTotalCents: null,
  clientele: "pro",
  buyerKind: "registered",
  companyId: "c1",
  fulfillmentMethod: "pickup",
  vatMethod: "line_ht",
  ttcByRate: null,
  subtotalCents: 1000,
  discountCents: 100,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 50,
  vatShares: [{ rate: 5.5, amountCents: 50 }],
  totalCents: 950,
  billableSubtotalCents: null,
  billableDiscountCents: null,
  billableVoucherDiscountCents: null,
  billableDeliveryFeeCents: null,
  billableLateFeeCents: null,
  billableVatCents: null,
  billableVatShares: null,
  billableTotalCents: null,
  settledOn: null,
  lines: [
    {
      sku: "VIE-001-1",
      productNameSnapshot: "Croissant",
      categoryId: "fam-viennoiserie",
      quantity: 10,
      saleUnit: "piece",
      unitPriceMillicents: 100_000,
      lineTotalCents: 1000,
      vatRate: new Prisma.Decimal("5.50"),
      lineTotalTtcCents: null,
      discounts: [{ orderDiscountId: "d1" }],
    },
  ],
};

describe("salesExportOrderOf — une commande pour l'export des ventes", () => {
  it("rend les montants tels qu'en base, le jour de réception et les remises couvertes", () => {
    const order = salesExportOrderOf(ROW);

    expect(order).toMatchObject({
      orderId: ROW.id,
      orderNumber: "C-0001",
      placedAt: PLACED_AT,
      receivedOn: "2026-03-12",
      countsAsRevenue: true,
      offered: false,
      clientele: "pro",
      buyerKind: "registered",
      companyId: "c1",
      fulfillment: "pickup",
      vatMethod: "line_ht",
      amounts: { subtotalCents: 1000, discountCents: 100, vatCents: 50, totalCents: 950 },
      ttcByRate: null,
      settlement: null,
    });
    expect(order.amounts.vatShares).toEqual([{ rate: 5.5, amountCents: 50 }]);
    expect(order.lines).toEqual([
      {
        sku: "VIE-001-1",
        productName: "Croissant",
        categoryId: "fam-viennoiserie",
        quantity: 10,
        saleUnit: "piece",
        unitPriceMillicents: 100_000,
        lineTotalCents: 1000,
        vatRate: 5.5,
        lineTotalTtcCents: null,
        discountIds: ["d1"],
      },
    ]);
  });

  it("une commande offerte garde sa valeur et ne compte pas dans le CA", () => {
    const order = salesExportOrderOf({
      ...ROW,
      offerNature: "tasting",
      offeredTotalCents: 950,
      totalCents: 0,
    });

    expect(order).toMatchObject({ offered: true, offeredTotalCents: 950, countsAsRevenue: false });
  });

  it("une commande interne porte sa nature, et reste hors du CA", () => {
    const order = salesExportOrderOf({
      ...ROW,
      offerNature: "in_house",
      offeredTotalCents: 950,
      totalCents: 0,
    });

    expect(order).toMatchObject({ offered: true, offerNature: "in_house", countsAsRevenue: false });
  });

  it("une commande à régler à la caisse de la boutique est servie, hors du CA", () => {
    expect(salesExportOrderOf({ ...ROW, settlementVenue: "shop_till" }).countsAsRevenue).toBe(
      false,
    );
  });

  it("une commande annulée est servie avec son instant d'annulation, hors du CA", () => {
    const cancelledAt = new Date("2026-03-11T09:00:00.000Z");
    const order = salesExportOrderOf({ ...ROW, status: "cancelled", cancelledAt });

    expect(order).toMatchObject({ status: "cancelled", cancelledAt, countsAsRevenue: false });
  });

  it("une commande soldée rend ce qu'elle a figé, et le jour du solde", () => {
    const order = salesExportOrderOf({
      ...ROW,
      billableSubtotalCents: 900,
      billableDiscountCents: 90,
      billableVoucherDiscountCents: 0,
      billableDeliveryFeeCents: 0,
      billableLateFeeCents: 0,
      billableVatCents: 45,
      billableVatShares: [{ rate: 5.5, amountCents: 45 }],
      billableTotalCents: 855,
      settledOn: new Date("2026-03-12T00:00:00.000Z"),
    });

    expect(order.settlement).toEqual({
      amounts: {
        subtotalCents: 900,
        discountCents: 90,
        voucherDiscountCents: 0,
        deliveryFeeCents: 0,
        lateFeeCents: 0,
        vatCents: 45,
        vatShares: [{ rate: 5.5, amountCents: 45 }],
        totalCents: 855,
      },
      settledOn: "2026-03-12",
    });
  });

  it("une commande d'un particulier rend la base HT par taux de `exact_ht`", () => {
    const parts = [{ rate: 5.5, htCents: 900, vatCents: 50, ttcCents: 950 }];
    const order = salesExportOrderOf({
      ...ROW,
      clientele: "public",
      companyId: null,
      vatMethod: "exact_ht",
      ttcByRate: parts,
    });

    expect(order).toMatchObject({ clientele: "public", companyId: null, ttcByRate: parts });
  });

  it("refuse une porte de passation inconnue plutôt que de la deviner", () => {
    expect(() => salesExportOrderOf({ ...ROW, buyerKind: "kiosque" })).toThrow(/kiosque/u);
  });
});
