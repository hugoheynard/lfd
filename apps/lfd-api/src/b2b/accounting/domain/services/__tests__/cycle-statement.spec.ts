import type { CycleOrder } from "../../ports/cycle-orders.reader.js";
import { aggregateStatement } from "../cycle-statement.js";

/** Les dates ne sont que portées : l'agrégation ne lit aucune horloge. */
const PLACED_AT = new Date(0);

let seq = 0;

function order(overrides: Partial<CycleOrder>): CycleOrder {
  seq += 1;
  return {
    id: `o${String(seq)}`,
    orderNumber: `CMD-${String(seq)}`,
    placedAt: PLACED_AT,
    companyId: "c-port",
    siteName: "Boulangerie du Port",
    subtotalCents: 0,
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    vatCents: 0,
    vatShares: [],
    totalCents: 0,
    collectionState: "due",
    ...overrides,
  };
}

/** Une commande à deux taux, livraison proratisée sur 20 %, remise et bon. */
const MIXED = order({
  subtotalCents: 10_000,
  discountCents: 500,
  voucherDiscountCents: 300,
  deliveryFeeCents: 1_500,
  lateFeeCents: 200,
  vatShares: [
    { rate: 5.5, amountCents: 437 },
    { rate: 20, amountCents: 740 },
  ],
  vatCents: 1_177,
  totalCents: 10_000 - 500 - 300 + 1_500 + 200 + 1_177,
});

/** Antérieure au 2026-09-07 : pas de ventilation figée. */
const LEGACY = order({
  subtotalCents: 4_000,
  vatShares: null,
  vatCents: 220,
  totalCents: 4_220,
});

const SINGLE_RATE = order({
  subtotalCents: 2_000,
  vatShares: [{ rate: 5.5, amountCents: 110 }],
  vatCents: 110,
  totalCents: 2_110,
});

describe("aggregateStatement", () => {
  it("lit le HT d'une commande comme sous-total − remise − bon, livraison et surtaxe à part", () => {
    const [line] = aggregateStatement([MIXED]).lines;
    expect(line?.htCents).toBe(9_200);
    expect(line?.deliveryFeeCents).toBe(1_500);
    expect(line?.lateFeeCents).toBe(200);
  });

  it("somme les parts figées PAR TAUX numérique, du plus bas au plus haut", () => {
    const { totals } = aggregateStatement([MIXED, SINGLE_RATE]);
    expect(totals.vatByRate).toEqual([
      { rate: 5.5, amountCents: 547 },
      { rate: 20, amountCents: 740 },
    ]);
  });

  it("porte la TVA d'une commande à vat_shares null en « non ventilée », sans la re-ventiler", () => {
    const statement = aggregateStatement([MIXED, LEGACY]);
    expect(statement.totals.unventilatedVatCents).toBe(220);
    expect(statement.totals.vatByRate).toEqual([
      { rate: 5.5, amountCents: 437 },
      { rate: 20, amountCents: 740 },
    ]);
    expect(statement.lines.map((line) => line.vatVentilated)).toEqual([true, false]);
  });

  it("traite une ventilation incohérente avec vat_cents comme absente", () => {
    const drifted = order({
      subtotalCents: 1_000,
      vatShares: [{ rate: 5.5, amountCents: 54 }],
      vatCents: 55,
      totalCents: 1_055,
    });
    const { totals } = aggregateStatement([drifted]);
    expect(totals.vatByRate).toEqual([]);
    expect(totals.unventilatedVatCents).toBe(55);
  });

  /** L'invariant du plan (§1.1) : le relevé retombe au centime sur les commandes. */
  it("Σ TVA par taux + non ventilée = Σ vat_cents, et Σ TTC = Σ total_cents", () => {
    const orders = [MIXED, LEGACY, SINGLE_RATE];
    const { totals } = aggregateStatement(orders);
    const byRate = totals.vatByRate.reduce((sum, share) => sum + share.amountCents, 0);

    expect(byRate + totals.unventilatedVatCents).toBe(
      orders.reduce((sum, item) => sum + item.vatCents, 0),
    );
    expect(totals.vatCents).toBe(1_177 + 220 + 110);
    expect(totals.totalCents).toBe(orders.reduce((sum, item) => sum + item.totalCents, 0));
  });

  it("additionne remises, bons, livraison et surtaxe sans les mêler au HT", () => {
    const { totals } = aggregateStatement([MIXED, SINGLE_RATE]);
    expect(totals).toMatchObject({
      orderCount: 2,
      subtotalCents: 12_000,
      discountCents: 500,
      voucherDiscountCents: 300,
      htCents: 11_200,
      deliveryFeeCents: 1_500,
      lateFeeCents: 200,
    });
  });

  it("rend un relevé à zéro pour un cycle vide", () => {
    const statement = aggregateStatement([]);
    expect(statement.lines).toEqual([]);
    expect(statement.totals).toMatchObject({
      orderCount: 0,
      vatByRate: [],
      unventilatedVatCents: 0,
      vatCents: 0,
      totalCents: 0,
    });
  });
});
