import { invoiceVatBreakdown, splitCents, type InvoiceVatBreakdown } from "@lfd/money";

import {
  COMPANY_DISCOUNT,
  DELIVERY_FOLLOWS_GOODS,
  LOYALTY_VOUCHER,
  simulateInvoiceDossier,
} from "../invoice-dossier.js";
import type { FrozenInvoiceOrder } from "../invoice-dossier.types.js";
import { frozenBon, goodsLine, type BonSpec } from "./per-order-cycle-fixtures.js";

/**
 * **La facture additionne les parts de ses bons** (plan
 * `documentation/comptabilite/facturation/plan-remises-ventilees-bon-par-bon.md`, §3).
 *
 * Avant le 2026-10-22, la facture répartissait remises et port une fois sur
 * tout le cycle : sur des bons de compositions différentes, une remise du pain
 * glissait sur les boissons d'un autre bon, et l'écart de COMPOSITION tombait
 * dans la rubrique « arrondi ». `cycleWide` rejoue cette ancienne répartition
 * pour montrer l'écart qu'elle faisait.
 */

const PAIN = 5.5;
const BOISSON = 20;

function partsOf(vat: InvoiceVatBreakdown, key: string): readonly (readonly number[])[] {
  return vat.categories.map((category) => [
    category.rate,
    category.allowances.find((part) => part.key === key)?.amountCents ??
      category.charges.find((part) => part.key === key)?.amountCents ??
      0,
  ]);
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** L'ancienne facture : la remise de retrait et le port répartis sur tout le cycle. */
function cycleWide(orders: readonly FrozenInvoiceOrder[]): InvoiceVatBreakdown {
  const goods = orders.flatMap((order) =>
    order.lines.map((line) => ({ htCents: line.lineTotalCents, vatRate: Number(line.vatRate) })),
  );
  const weights = new Map<number, bigint>();
  for (const line of goods) {
    weights.set(line.vatRate, (weights.get(line.vatRate) ?? 0n) + BigInt(line.htCents));
  }
  const rated = (cents: number) =>
    [...splitCents(cents, weights).entries()].map(([vatRate, amountCents]) => ({
      vatRate,
      amountCents,
    }));
  return invoiceVatBreakdown({
    goods,
    allowances: [
      { key: COMPANY_DISCOUNT, byRate: rated(sumOf(orders.map((o) => o.discountCents))) },
      { key: LOYALTY_VOUCHER, byRate: rated(sumOf(orders.map((o) => o.voucherDiscountCents))) },
    ],
    charges: [
      {
        key: DELIVERY_FOLLOWS_GOODS,
        byRate: rated(sumOf(orders.map((o) => o.deliveryFeeCents))),
      },
    ],
  });
}

function ordersVatByRate(orders: readonly FrozenInvoiceOrder[]): ReadonlyMap<number, number> {
  const byRate = new Map<number, number>();
  for (const share of orders.flatMap((order) => order.vatShares ?? [])) {
    byRate.set(share.rate, (byRate.get(share.rate) ?? 0) + share.amountCents);
  }
  return byRate;
}

function compositionGap(vat: InvoiceVatBreakdown, orders: readonly FrozenInvoiceOrder[]): number {
  const bons = ordersVatByRate(orders);
  return sumOf(
    vat.categories.map((category) => Math.abs(category.vatCents - (bons.get(category.rate) ?? 0))),
  );
}

describe("la facture — remises et port découpés bon par bon", () => {
  /** L'exemple du §0 : un bon de pain remisé de 5 €, un bon de boissons sans remise. */
  const painRemise = frozenBon({
    reference: "ORD-1",
    lines: [goodsLine("PAI", PAIN, 2_000)],
    pickupDiscountCents: 500,
  });
  const boissons = frozenBon({ reference: "ORD-2", lines: [goodsLine("BOI", BOISSON, 3_000)] });

  it("§0 : les 5 € restent sur le 5,5 % ; l'écart de composition disparaît", () => {
    const dossier = simulateInvoiceDossier([painRemise, boissons]);

    expect(partsOf(dossier.invoice.vat, COMPANY_DISCOUNT)).toEqual([
      [PAIN, 500],
      [BOISSON, 0],
    ]);
    expect(dossier.gaps.vatRoundingCents).toBe(0);
    expect(dossier.differenceCents).toBe(0);
  });

  it("§0 : la répartition sur le cycle, elle, faisait un écart de composition", () => {
    // 500 sur 2000 / 3000 → 200 / 300 : 300 de remise glissent sur les boissons.
    const before = cycleWide([painRemise, boissons]);

    expect(partsOf(before, COMPANY_DISCOUNT)).toEqual([
      [PAIN, 200],
      [BOISSON, 300],
    ]);
    expect(compositionGap(before, [painRemise, boissons])).toBeGreaterThan(50);
  });

  it("le port qui suit la marchandise reste sur les taux de son bon", () => {
    const orders = [
      frozenBon({
        reference: "ORD-1",
        lines: [goodsLine("PAI", PAIN, 2_000)],
        deliveryFeeCents: 400,
        deliveryVatMode: "follows_goods",
      }),
      frozenBon({
        reference: "ORD-2",
        lines: [goodsLine("BOI", BOISSON, 3_000)],
        deliveryFeeCents: 300,
        deliveryVatMode: "follows_goods",
      }),
    ];

    const dossier = simulateInvoiceDossier(orders);

    expect(partsOf(dossier.invoice.vat, DELIVERY_FOLLOWS_GOODS)).toEqual([
      [PAIN, 400],
      [BOISSON, 300],
    ]);
    expect(dossier.differenceCents).toBe(0);
    // Sur le cycle, 700 au prorata de 2000 / 3000 → 280 / 420.
    expect(partsOf(cycleWide(orders), DELIVERY_FOLLOWS_GOODS)).toEqual([
      [PAIN, 280],
      [BOISSON, 420],
    ]);
  });

  it("une remise de retrait qui absorbe tout un taux, puis un bon de fidélité : aucune base négative", () => {
    const bon = frozenBon({
      reference: "ORD-1",
      lines: [goodsLine("PAI", PAIN, 1_000), goodsLine("JUS", BOISSON, 1_000, true)],
      pickupDiscountCents: 1_000,
      voucherCents: 300,
    });

    const { vat } = simulateInvoiceDossier([bon]).invoice;

    expect(vat.categories.map((c) => [c.rate, c.taxableBaseCents])).toEqual([
      [PAIN, 0],
      [BOISSON, 700],
    ]);
    expect(partsOf(vat, LOYALTY_VOUCHER)).toEqual([
      [PAIN, 0],
      [BOISSON, 300],
    ]);
  });

  it("sans exclusion, des bons de même composition : la facture d'avant, au centime", () => {
    const same = (reference: string): FrozenInvoiceOrder =>
      frozenBon({
        reference,
        lines: [goodsLine("PAI", PAIN, 1_000), goodsLine("JUS", BOISSON, 1_000)],
        pickupDiscountCents: 100,
        deliveryFeeCents: 200,
        deliveryVatMode: "follows_goods",
      });
    const orders = [same("ORD-1"), same("ORD-2"), same("ORD-3")];

    const { vat } = simulateInvoiceDossier(orders).invoice;
    const before = cycleWide(orders);

    expect(vat.categories).toEqual(before.categories);
    expect(vat.totalCents).toBe(before.totalCents);
  });
});

describe("la facture — ce qui reste est un pur arrondi", () => {
  /**
   * Pour tout cycle : |TVA facture − Σ TVA des bons| ≤ ½ centime × bons × taux
   * (plan, §3), et Σ BT-92 = BT-107 — les remises par taux retombent sur le
   * total des remises de la facture, et sur ce que les bons ont déduit.
   */
  it("sur des cycles tirés d'une suite déterministe", () => {
    for (const orders of generatedCycles(200)) {
      const dossier = simulateInvoiceDossier(orders);
      const { vat } = dossier.invoice;
      const rates = new Set(orders.flatMap((o) => o.lines.map((l) => Number(l.vatRate)))).size;
      const ordersVat = sumOf(orders.map((o) => o.vatCents));

      expect(Math.abs(vat.vatCents - ordersVat)).toBeLessThanOrEqual(0.5 * orders.length * rates);
      const bt92 = sumOf(vat.categories.flatMap((c) => c.allowances.map((p) => p.amountCents)));
      expect(bt92).toBe(vat.allowancesCents);
      expect(bt92).toBe(
        dossier.invoice.companyDiscountCents + dossier.invoice.voucherDiscountCents,
      );
      expect(vat.categories.every((c) => c.taxableBaseCents >= 0)).toBe(true);
      expect(dossier.gaps.totalCents).toBe(dossier.differenceCents);
    }
  });
});

const RATES = [5.5, 10, 20] as const;

/** Des cycles de un à cinq bons, de compositions variées ; rejoués à l'identique. */
function* generatedCycles(count: number): Generator<readonly FrozenInvoiceOrder[]> {
  let seed = 20261022;
  const next = (bound: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % bound;
  };
  for (let cycle = 0; cycle < count; cycle += 1) {
    yield Array.from({ length: 1 + next(5) }, (_, index): FrozenInvoiceOrder => {
      const lines = Array.from({ length: 1 + next(3) }, (__, i) =>
        goodsLine(
          `SKU-${String(i)}`,
          RATES[next(RATES.length)] ?? BOISSON,
          1 + next(4_000),
          next(3) === 0,
        ),
      );
      const delivered = next(2) === 0;
      const spec: BonSpec = delivered
        ? {
            reference: `ORD-${String(index)}`,
            lines,
            voucherCents: next(2) === 0 ? 0 : next(1_500),
            deliveryFeeCents: next(800),
            deliveryVatMode: next(2) === 0 ? "follows_goods" : "standard",
          }
        : {
            reference: `ORD-${String(index)}`,
            lines,
            pickupDiscountCents: next(600),
            voucherCents: next(2) === 0 ? 0 : next(1_500),
          };
      return boundedBon(spec);
    });
  }
}

/**
 * Le bon fige des remises BORNÉES (garde de l'agrégat, imputation du bon de
 * fidélité) : la fixture les borne comme lui.
 */
function boundedBon(spec: BonSpec): FrozenInvoiceOrder {
  const goods = sumOf(spec.lines.map((line) => line.lineTotalCents));
  const eligible = sumOf(
    spec.lines.filter((line) => line.pickupDiscountEligible !== false).map((l) => l.lineTotalCents),
  );
  const pickup = Math.min(spec.pickupDiscountCents ?? 0, eligible);
  const voucher = Math.min(spec.voucherCents ?? 0, goods - pickup);
  return frozenBon({ ...spec, pickupDiscountCents: pickup, voucherCents: voucher });
}
