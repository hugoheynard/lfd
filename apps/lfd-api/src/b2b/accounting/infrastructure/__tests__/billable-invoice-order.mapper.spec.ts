import { Prisma } from "../../../../platform/database/client/client.js";
import { toFrozenInvoiceOrder } from "../frozen-invoice-order.mapper.js";
import { InvoiceLineSaleUnitUnknownError } from "../invoice-sale-unit.column.js";
import {
  handedOverNoteNumbersOf,
  toBillableInvoiceOrder,
  UnsettledPartialOrderError,
  type BillableInvoiceOrderRow,
} from "../billable-invoice-order.mapper.js";

/**
 * La couture de la facture (lot E6c2, plan
 * plan E6c2 (`documentation/commandes/bon-de-livraison.md`)
 * § 0 et § 4) : ce qu'un bon au compte doit est ce qui est PARTI. Les dates ne
 * sont comparées à aucune horloge.
 */

const PLACED = new Date("2026-10-20T08:00:00.000Z");

/** Une ligne de commande de 3 croissants à 1,00 € HT. */
const ORDER_LINE = {
  sku: "CRO",
  productNameSnapshot: "Croissant",
  unitPriceMillicents: 100_000,
  vatRate: new Prisma.Decimal("5.50"),
  quantity: 3,
  saleUnit: "piece",
  lineTotalCents: 300,
  pickupDiscountEligible: true,
};

function noteLine(sku: string, quantity: number, saleUnit = "piece") {
  return {
    sku,
    productName: sku === "CRO" ? "Croissant" : "Pain",
    unitPriceMillicents: 100_000,
    vatRate: new Prisma.Decimal("5.50"),
    quantity,
    saleUnit,
    lineTotalCents: quantity * 100,
    pickupDiscountEligible: null,
  };
}

/** Une commande de 3,00 € HT + 0,17 € de TVA, dont un BL partiel n'a remis qu'un croissant. */
function row(overrides: Partial<BillableInvoiceOrderRow> = {}): BillableInvoiceOrderRow {
  return {
    orderNumber: "ORD-1042",
    createdAt: PLACED,
    requestedDeliveryDate: new Date("2026-10-21T00:00:00.000Z"),
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    vatShares: [{ rate: 5.5, amountCents: 17 }],
    vatCents: 17,
    totalCents: 317,
    lines: [ORDER_LINE],
    billableDiscountCents: null,
    billableVoucherDiscountCents: null,
    billableDeliveryFeeCents: null,
    billableLateFeeCents: null,
    billableVatCents: null,
    billableVatShares: null,
    billableTotalCents: null,
    shortfallDecisions: [],
    deliveryNotes: [],
    ...overrides,
  };
}

const PARTIAL_BILLABLE = {
  billableDiscountCents: 0,
  billableVoucherDiscountCents: 0,
  billableDeliveryFeeCents: 0,
  billableLateFeeCents: 0,
  billableVatCents: 6,
  billableVatShares: [{ rate: 5.5, amountCents: 6 }],
  billableTotalCents: 106,
};

describe("toBillableInvoiceOrder", () => {
  it("deux envois remis, sans décision (plan E7 reliquat, L5b) : les lignes des BL, le reste à son jour", () => {
    const frozen = toBillableInvoiceOrder(
      row({
        ...PARTIAL_BILLABLE,
        billableTotalCents: 317,
        deliveryNotes: [
          { number: "BL-1042-1", serviceDay: null, lines: [noteLine("CRO", 2)] },
          {
            number: "BL-1042-2",
            serviceDay: new Date("2026-10-23T00:00:00.000Z"),
            lines: [noteLine("CRO", 1)],
          },
        ],
      }),
    );

    expect(frozen.lines.map((line) => [line.quantity, line.deliveryDate])).toEqual([
      [2, undefined],
      [1, "2026-10-23"],
    ]);
    expect(frozen.totalCents).toBe(317);
  });

  it("un départ incomplet : les lignes des BL remis, par rang puis par ligne, et les totaux facturables", () => {
    const frozen = toBillableInvoiceOrder(
      row({
        ...PARTIAL_BILLABLE,
        shortfallDecisions: [{ id: "dec_1" }],
        deliveryNotes: [
          {
            number: "BL-1042-1",
            serviceDay: null,
            lines: [noteLine("CRO", 1), noteLine("PAI", 2)],
          },
          { number: "BL-1042-2", serviceDay: null, lines: [noteLine("CRO", 1)] },
        ],
      }),
    );

    expect(frozen.lines.map((line) => [line.sku, line.quantity])).toEqual([
      ["CRO", 1],
      ["PAI", 2],
      ["CRO", 1],
    ]);
    expect(frozen.lines[0]).not.toHaveProperty("pickupDiscountEligible");
    expect(frozen).toMatchObject({
      totalCents: 106,
      vatCents: 6,
      vatShares: [{ rate: 5.5, amountCents: 6 }],
    });
  });

  it("une commande à un BL complet : ses lignes, et la recopie posée de ses totaux", () => {
    const frozen = toBillableInvoiceOrder(
      row({
        billableDiscountCents: 0,
        billableVoucherDiscountCents: 0,
        billableDeliveryFeeCents: 0,
        billableLateFeeCents: 0,
        billableVatCents: 17,
        billableVatShares: [{ rate: 5.5, amountCents: 17 }],
        billableTotalCents: 317,
        deliveryNotes: [{ number: "BL-1042-1", serviceDay: null, lines: [noteLine("CRO", 3)] }],
      }),
    );

    expect(frozen.lines).toEqual([
      {
        sku: "CRO",
        productNameSnapshot: "Croissant",
        unitPriceMillicents: 100_000,
        vatRate: "5.5",
        quantity: 3,
        saleUnit: "piece",
        lineTotalCents: 300,
        pickupDiscountEligible: true,
      },
    ]);
    expect(frozen.totalCents).toBe(317);
  });

  it("sans solde ni décision : les totaux de la commande, ce que le solde y poserait", () => {
    expect(toBillableInvoiceOrder(row()).totalCents).toBe(317);
  });

  it("un départ incomplet sans solde n'est jamais facturé sur la commande entière", () => {
    expect(() => toBillableInvoiceOrder(row({ shortfallDecisions: [{ id: "dec_1" }] }))).toThrow(
      UnsettledPartialOrderError,
    );
  });
});

describe("l'unité de vente des lignes (plan vente au poids, P7)", () => {
  it("la commande (facture carte, BL unique) : une ligne au poids garde ses grammes et son unité", () => {
    const frozen = toFrozenInvoiceOrder(
      row({ lines: [{ ...ORDER_LINE, quantity: 1_250, saleUnit: "weight" }] }),
    );

    expect(frozen.lines.map((line) => [line.quantity, line.saleUnit])).toEqual([[1_250, "weight"]]);
  });

  it("un départ incomplet : la ligne au poids du BL remis porte les grammes remis, en `weight`", () => {
    const frozen = toBillableInvoiceOrder(
      row({
        ...PARTIAL_BILLABLE,
        shortfallDecisions: [{ id: "dec_1" }],
        deliveryNotes: [
          {
            number: "BL-1042-1",
            serviceDay: null,
            lines: [noteLine("CRO", 1), noteLine("PAI", 750, "weight")],
          },
        ],
      }),
    );

    expect(frozen.lines.map((line) => [line.sku, line.quantity, line.saleUnit])).toEqual([
      ["CRO", 1, "piece"],
      ["PAI", 750, "weight"],
    ]);
  });

  it("une unité inconnue sur la commande arrête la lecture au lieu de compter en pièces", () => {
    expect(() =>
      toFrozenInvoiceOrder(row({ lines: [{ ...ORDER_LINE, saleUnit: "litre" }] })),
    ).toThrow(InvoiceLineSaleUnitUnknownError);
  });

  it("une unité inconnue sur un BL remis arrête la lecture, en nommant le bon", () => {
    expect(() =>
      toBillableInvoiceOrder(
        row({
          ...PARTIAL_BILLABLE,
          shortfallDecisions: [{ id: "dec_1" }],
          deliveryNotes: [
            { number: "BL-1042-1", serviceDay: null, lines: [noteLine("CRO", 1, "")] },
          ],
        }),
      ),
    ).toThrow(/ORD-1042.*CRO/u);
  });
});

describe("handedOverNoteNumbersOf", () => {
  it("rend les numéros des BL remis, dans l'ordre lu", () => {
    expect(
      handedOverNoteNumbersOf({ deliveryNotes: [{ number: "BL-1-1" }, { number: "BL-1-2" }] }),
    ).toEqual(["BL-1-1", "BL-1-2"]);
  });
});
