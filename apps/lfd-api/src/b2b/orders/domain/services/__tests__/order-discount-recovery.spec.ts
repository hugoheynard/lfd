import type { CartAdjustment } from "@lfd/contracts";

import { composeExactOrder } from "../exact-order-composition.js";
import type {
  RecoveryNote,
  RecoveryOrder,
  RecoveryOrderLine,
} from "../order-discount-recovery-shapes.js";
import { recoverOrderDiscount } from "../order-discount-recovery.js";

/**
 * Lot M2 du plan des promotions (§ 18.3) : la reprise d'une remise unique en
 * ligne `order_discounts`. Égale au figé → `computed` ; écart → `frozen`
 * recopiée sans recalcul ; écart à plusieurs taux → `undecided`, rien d'écrit.
 */

const TEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1000 };
const FIXED: CartAdjustment = { mode: "amount", cents: 250 };

function line(id: string, over: Partial<RecoveryOrderLine> = {}): RecoveryOrderLine {
  return {
    id,
    unitPriceMillicents: 100_000,
    quantity: 10,
    saleUnit: "piece",
    vatRate: 5.5,
    lineTotalCents: 1_000,
    eligible: true,
    ...over,
  };
}

function lineHtOrder(over: Partial<RecoveryOrder> = {}): RecoveryOrder {
  return {
    id: "o1",
    orderNumber: "ORD-1",
    vatMethod: "line_ht",
    discountCents: 100,
    discountTtcCents: null,
    discountAdjustment: TEN_PERCENT,
    deliveryFeeAdjustment: null,
    deliveryVatMode: null,
    voucherTtcCents: null,
    deliveryFeeTtcCents: null,
    ttcByRate: null,
    lines: [line("l1"), line("l2", { vatRate: 20, lineTotalCents: 500, eligible: false })],
    notes: [],
    ...over,
  };
}

function note(over: Partial<RecoveryNote> = {}): RecoveryNote {
  return {
    id: "n1",
    rank: 1,
    voided: false,
    discountCents: 100,
    discountTtcCents: null,
    lines: [line("x")],
    ...over,
  };
}

describe("une commande line_ht", () => {
  it("égale au figé : computed, une part au taux des lignes couvertes, l'assiette éligible", () => {
    const recovery = recoverOrderDiscount(lineHtOrder());

    expect(recovery).toEqual({
      kind: "recovered",
      gap: null,
      discount: {
        origin: "computed",
        baseCents: 1_000,
        coveredLineIds: ["l1"],
        amountCents: 100,
        amountTtcCents: null,
        vatShares: [{ rate: 5.5, htCents: 100 }],
        notes: [],
      },
    });
  });

  it("deux taux couverts : les parts somment le montant", () => {
    const recovery = recoverOrderDiscount(
      lineHtOrder({
        discountCents: 150,
        lines: [line("l1"), line("l2", { vatRate: 20, lineTotalCents: 500 })],
      }),
    );

    expect(recovery.kind === "recovered" && recovery.discount.vatShares).toEqual([
      { rate: 5.5, htCents: 100 },
      { rate: 20, htCents: 50 },
    ]);
  });

  it("un écart réel à un seul taux est recopié tel quel", () => {
    const recovery = recoverOrderDiscount(lineHtOrder({ discountCents: 137, lines: [line("l1")] }));

    expect(recovery).toMatchObject({
      kind: "recovered",
      gap: "remise recomposée 100 c HT, figée 137 c HT",
      discount: {
        origin: "frozen",
        amountCents: 137,
        amountTtcCents: null,
        vatShares: [{ rate: 5.5, htCents: 137 }],
      },
    });
  });

  it("en écart, lignes couvertes à plusieurs taux : à trancher, rien d'inventé", () => {
    const recovery = recoverOrderDiscount(
      lineHtOrder({
        discountCents: 137,
        lines: [line("l1"), line("l2", { vatRate: 20, lineTotalCents: 500 })],
      }),
    );

    expect(recovery.kind).toBe("undecided");
    expect(recovery.kind === "undecided" && recovery.reason).toContain("2 taux");
  });

  /**
   * Décision sur le rapport de M2 (2026-10-30) : la part d'une `frozen` se
   * tire des seules lignes couvertes. Une ligne exclue à un autre taux n'a
   * reçu aucune part de la remise : elle ne rend plus la commande « à trancher ».
   */
  it("en écart, une ligne exclue à un autre taux ne compte pas : frozen au taux des couvertes", () => {
    const recovery = recoverOrderDiscount(lineHtOrder({ discountCents: 137 }));

    expect(recovery).toMatchObject({
      kind: "recovered",
      discount: { origin: "frozen", amountCents: 137, vatShares: [{ rate: 5.5, htCents: 137 }] },
    });
  });

  it("sans ajustement figé : frozen, rien ne se recompose", () => {
    const recovery = recoverOrderDiscount(
      lineHtOrder({ discountAdjustment: null, lines: [line("l1")] }),
    );

    expect(recovery).toMatchObject({
      kind: "recovered",
      discount: { origin: "frozen", amountCents: 100 },
    });
  });
});

describe("les bons d'une commande line_ht", () => {
  it("un bon partiel recomposé sur ses lignes : sa part est écrite", () => {
    const recovery = recoverOrderDiscount(
      lineHtOrder({
        notes: [note({ discountCents: 50, lines: [line("x", { lineTotalCents: 500 })] })],
      }),
    );

    expect(recovery.kind === "recovered" && recovery.discount.notes).toEqual([
      {
        noteId: "n1",
        amountCents: 50,
        amountTtcCents: null,
        vatShares: [{ rate: 5.5, htCents: 50 }],
      },
    ]);
  });

  it("un bon annulé, ou sans en-tête, n'a pas de part", () => {
    const recovery = recoverOrderDiscount(
      lineHtOrder({
        notes: [note({ voided: true }), note({ id: "n2", rank: 2, discountCents: null })],
      }),
    );

    expect(recovery).toMatchObject({ kind: "recovered", gap: null, discount: { notes: [] } });
  });

  it("un montant fixe compté sur un reliquat est un écart", () => {
    const recovery = recoverOrderDiscount(
      lineHtOrder({
        discountAdjustment: FIXED,
        discountCents: 250,
        lines: [line("l1")],
        notes: [note({ discountCents: 250 }), note({ id: "n2", rank: 2, discountCents: 30 })],
      }),
    );

    expect(recovery).toMatchObject({
      kind: "recovered",
      gap: "bon de rang 2 : montant fixe compté sur un reliquat (30 c)",
      discount: {
        origin: "frozen",
        notes: [
          { noteId: "n1", amountCents: 250 },
          { noteId: "n2", amountCents: 30 },
        ],
      },
    });
  });

  it("un montant fixe n'a de part que sur le BL-1", () => {
    const recovery = recoverOrderDiscount(
      lineHtOrder({
        discountAdjustment: FIXED,
        discountCents: 250,
        lines: [line("l1")],
        notes: [note({ discountCents: 250 }), note({ id: "n2", rank: 2, discountCents: 0 })],
      }),
    );

    expect(recovery).toMatchObject({ kind: "recovered", gap: null });
    expect(recovery.kind === "recovered" && recovery.discount.notes.map((n) => n.noteId)).toEqual([
      "n1",
    ]);
  });
});

/** Une commande exact_ht telle que la passation l'a figée : par la composition elle-même. */
function placedExact(lines: readonly RecoveryOrderLine[]): RecoveryOrder {
  const composition = composeExactOrder({
    lines: lines.map((l) => ({ ...l, pickupDiscountEligible: l.eligible })),
    discountAdjustment: TEN_PERCENT,
    deliveryFeeAdjustment: null,
    deliveryVatMode: null,
    voucherFaceCents: 0,
  });
  return lineHtOrder({
    vatMethod: "exact_ht",
    discountCents: composition.pickupDiscount.htCents,
    discountTtcCents: composition.pickupDiscount.ttcCents,
    voucherTtcCents: 0,
    deliveryFeeTtcCents: 0,
    ttcByRate: composition.byRate.map((part) => ({
      rate: part.vatRate,
      htCents: part.htCents,
      vatCents: part.vatCents,
      ttcCents: part.ttcCents,
    })),
    lines,
  });
}

describe("une commande exact_ht", () => {
  // 19,9052 € HT à 5,5 % : l'étiquette du banana bread, 21,00 € TTC.
  const BANANA = line("l1", { unitPriceMillicents: 1_990_520, quantity: 1, lineTotalCents: 1_990 });

  it("égale au figé : computed, TTC et parts TTC écrits, assiette au TTC", () => {
    const recovery = recoverOrderDiscount(placedExact([BANANA]));

    expect(recovery).toMatchObject({
      kind: "recovered",
      gap: null,
      discount: { origin: "computed", amountTtcCents: 210, baseCents: 2_100 },
    });
    const discount = recovery.kind === "recovered" ? recovery.discount : null;
    expect(discount?.vatShares).toEqual([
      {
        rate: 5.5,
        htCents: discount?.amountCents,
        vatCents: 210 - (discount?.amountCents ?? 0),
        ttcCents: 210,
      },
    ]);
  });

  it("un TTC figé qui ne se recompose pas : frozen, part recopiée", () => {
    const placed = placedExact([BANANA]);
    const recovery = recoverOrderDiscount({ ...placed, discountTtcCents: 211 });

    expect(recovery).toMatchObject({
      kind: "recovered",
      discount: {
        origin: "frozen",
        amountTtcCents: 211,
        vatShares: [{ rate: 5.5, htCents: placed.discountCents, ttcCents: 211 }],
      },
    });
  });

  it("des parts par taux figées qui diffèrent : écart", () => {
    const placed = placedExact([BANANA]);
    const recovery = recoverOrderDiscount({
      ...placed,
      ttcByRate: [{ rate: 5.5, htCents: 1, vatCents: 1, ttcCents: 2 }],
    });

    expect(recovery.kind === "recovered" && recovery.discount.origin).toBe("frozen");
  });

  it("sans `ttc_by_rate` (commande d'avant la colonne) : le terme seul est comparé", () => {
    const recovery = recoverOrderDiscount({ ...placedExact([BANANA]), ttcByRate: null });

    expect(recovery.kind === "recovered" && recovery.discount.origin).toBe("computed");
  });
});
