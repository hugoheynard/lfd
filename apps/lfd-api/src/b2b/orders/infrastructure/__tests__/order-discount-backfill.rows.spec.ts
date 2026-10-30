import { Prisma } from "../../../../platform/database/client/client.js";
import {
  orderDiscountData,
  sharesJson,
  toRecoveryOrder,
  type BackfillOrderRow,
} from "../order-discount-backfill.rows.js";

/**
 * Les deux traductions de la reprise des remises (plan des promotions,
 * § 18.3, M2) : colonnes figées → commande à juger, remise reprise → lignes.
 */

function row(over: Partial<BackfillOrderRow> = {}): BackfillOrderRow {
  return {
    id: "o1",
    orderNumber: "ORD-1",
    vatMethod: "line_ht",
    discountCents: 100,
    discountTtcCents: null,
    discountAdjustment: { mode: "percent", bp: 1000 },
    discountPromotionId: "promo-1",
    discountLabel: { fr: "Remise de retrait", en: "Pickup discount", it: "Sconto" },
    deliveryFeeAdjustment: null,
    lateFeeAdjustment: null,
    deliveryVatMode: null,
    voucherTtcCents: null,
    deliveryFeeTtcCents: null,
    ttcByRate: null,
    lines: [
      {
        id: "l1",
        sku: "VIE-001-1",
        unitPriceMillicents: 100_000,
        quantity: 10,
        saleUnit: "piece",
        vatRate: new Prisma.Decimal("5.50"),
        lineTotalCents: 1_000,
        pickupDiscountEligible: true,
      },
    ],
    deliveryNotes: [
      {
        id: "n1",
        rank: 1,
        status: "voided",
        discountCents: 100,
        discountTtcCents: null,
        lines: [
          {
            sku: "VIE-001-1",
            unitPriceMillicents: 100_000,
            quantity: 10,
            saleUnit: "piece",
            vatRate: new Prisma.Decimal("5.50"),
            lineTotalCents: 1_000,
            pickupDiscountEligible: null,
          },
        ],
      },
    ],
    ...over,
  };
}

describe("colonnes figées → commande à juger", () => {
  it("lit le taux en nombre, l'ajustement validé, le bon annulé", () => {
    const order = toRecoveryOrder(row());

    expect(order).toMatchObject({
      vatMethod: "line_ht",
      discountAdjustment: { mode: "percent", bp: 1000 },
      lines: [{ id: "l1", vatRate: 5.5, eligible: true }],
      notes: [{ id: "n1", voided: true }],
    });
  });

  it("une ligne de bon d'avant E4a (éligibilité NULL) compte éligible", () => {
    expect(toRecoveryOrder(row()).notes[0]?.lines[0]?.eligible).toBe(true);
  });

  it("des parts par taux illisibles ne remontent pas", () => {
    expect(toRecoveryOrder(row({ ttcByRate: [{ rate: "x" }] })).ttcByRate).toBeNull();
  });

  it("un ajustement figé illisible est refusé, pas deviné", () => {
    expect(() => toRecoveryOrder(row({ discountAdjustment: { mode: "?" } }))).toThrow(/illisible/);
  });
});

describe("remise reprise → lignes", () => {
  it("recopie promotion, ajustement et libellé ; rang 1 ; couvertures et parts de bons", () => {
    let next = 0;
    const data = orderDiscountData(
      "o1",
      {
        origin: "computed",
        baseCents: 1_000,
        coveredLineIds: ["l1"],
        amountCents: 100,
        amountTtcCents: null,
        vatShares: [{ rate: 5.5, htCents: 100 }],
        notes: [
          {
            noteId: "n1",
            amountCents: 100,
            amountTtcCents: null,
            vatShares: [{ rate: 5.5, htCents: 100 }],
          },
        ],
      },
      { promotionId: "promo-1", adjustment: { mode: "percent", bp: 1000 }, label: null },
      () => {
        next += 1;
        return `id-${next}`;
      },
    );

    expect(data).toEqual({
      id: "id-1",
      orderId: "o1",
      origin: "computed",
      rank: 1,
      promotionId: "promo-1",
      adjustment: { mode: "percent", bp: 1000 },
      label: Prisma.DbNull,
      baseCents: 1_000,
      amountCents: 100,
      amountTtcCents: null,
      vatShares: [{ rate: 5.5, htCents: 100 }],
      coveredLines: { create: [{ orderLineId: "l1" }] },
      noteParts: {
        create: [
          {
            id: "id-2",
            noteId: "n1",
            amountCents: 100,
            amountTtcCents: null,
            vatShares: [{ rate: 5.5, htCents: 100 }],
          },
        ],
      },
    });
  });

  it("une part line_ht n'a pas de clé TTC ; une part exact_ht les a toutes", () => {
    expect(
      sharesJson([
        { rate: 5.5, htCents: 10 },
        { rate: 20, htCents: 10, vatCents: 2, ttcCents: 12 },
      ]),
    ).toEqual([
      { rate: 5.5, htCents: 10 },
      { rate: 20, htCents: 10, vatCents: 2, ttcCents: 12 },
    ]);
  });
});
