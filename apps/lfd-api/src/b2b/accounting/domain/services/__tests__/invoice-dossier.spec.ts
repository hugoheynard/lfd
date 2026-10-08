import { DELIVERY_VAT_RATE, lineTotalCents, ventilateVat, type VatExtra } from "@lfd/money";

import { InvoiceDossierLateFeeRateMissingError } from "../../errors/invoice-dossier-errors.js";
import { simulateInvoiceDossier } from "../invoice-dossier.js";
import type {
  FrozenDeliveryVatMode,
  FrozenInvoiceOrder,
  InvoiceDossier,
} from "../invoice-dossier.types.js";

/**
 * Les dates ne sont que comparées entre elles : le calcul ne lit aucune
 * horloge. Les instants de passation partent de l'époque Unix.
 */
interface LineSpec {
  readonly sku: string;
  readonly name?: string;
  readonly price: number;
  readonly rate: string;
  readonly qty: number;
}

interface BonSpec {
  readonly lines: readonly LineSpec[];
  readonly placedSeq?: number;
  readonly date?: string | null;
  readonly discount?: number;
  readonly voucher?: number;
  readonly delivery?: number;
  readonly mode?: FrozenDeliveryVatMode | null;
  readonly lateFee?: number;
  readonly lateRate?: number | null;
  readonly ventilated?: boolean;
}

let seq = 0;

/** Un bon tel que la passation le fige : ses totaux sortent de `ventilateVat`. */
function bon(spec: BonSpec): FrozenInvoiceOrder {
  seq += 1;
  const lines = spec.lines.map((line) => ({
    sku: line.sku,
    productNameSnapshot: line.name ?? line.sku,
    unitPriceMillicents: line.price,
    vatRate: line.rate,
    quantity: line.qty,
    lineTotalCents: lineTotalCents(line.price, line.qty),
  }));
  const delivery = spec.delivery ?? 0;
  const mode = spec.mode ?? null;
  const lateFee = spec.lateFee ?? 0;
  const lateRate = spec.lateRate === undefined ? 10 : spec.lateRate;
  const extras: VatExtra[] = [];
  if (delivery !== 0) {
    extras.push(
      mode === "follows_goods"
        ? { htCents: delivery, followsGoods: true }
        : { htCents: delivery, vatRate: DELIVERY_VAT_RATE },
    );
  }
  if (lateFee !== 0) {
    extras.push({ htCents: lateFee, vatRate: lateRate ?? 0 });
  }
  const ventilation = ventilateVat({
    lines: lines.map((line) => ({ htCents: line.lineTotalCents, vatRate: Number(line.vatRate) })),
    discountCents: (spec.discount ?? 0) + (spec.voucher ?? 0),
    extras,
  });
  return {
    reference: `CMD-${String(seq)}`,
    createdAt: new Date((spec.placedSeq ?? seq) * 60_000),
    requestedDeliveryDate: spec.date === undefined ? null : spec.date,
    lines,
    discountCents: spec.discount ?? 0,
    voucherDiscountCents: spec.voucher ?? 0,
    deliveryFeeCents: delivery,
    deliveryVatMode: mode,
    lateFeeCents: lateFee,
    lateFeeVatRate: lateRate,
    vatShares: spec.ventilated === false ? null : ventilation.vat,
    vatCents: ventilation.vatTotalCents,
    totalCents: ventilation.totalCents,
  };
}

/** L'invariant du §3.4 : la différence est la somme des trois écarts, au centime. */
function expectGapsExplainDifference(dossier: InvoiceDossier): void {
  const { gaps } = dossier;
  expect(gaps.lineRoundingCents + gaps.vatRoundingCents + gaps.unventilatedVat.gapCents).toBe(
    gaps.totalCents,
  );
  expect(dossier.invoice.totalCents - dossier.ordersTotalCents).toBe(gaps.totalCents);
  expect(dossier.differenceCents).toBe(gaps.totalCents);
}

const BAGUETTE = { sku: "BAG-001", rate: "5.50" } as const;

describe("simulateInvoiceDossier — les lignes", () => {
  it("un changement de tarif fait deux lignes du même produit, chacune datée", () => {
    const dossier = simulateInvoiceDossier([
      bon({ lines: [{ ...BAGUETTE, price: 120_000, qty: 10 }], date: "2026-10-02" }),
      bon({ lines: [{ ...BAGUETTE, price: 120_000, qty: 5 }], date: "2026-10-05" }),
      bon({ lines: [{ ...BAGUETTE, price: 130_000, qty: 4 }], date: "2026-10-20" }),
    ]);

    expect(
      dossier.invoice.lines.map((l) => [
        l.unitPriceMillicents,
        l.quantity,
        l.amountCents,
        l.firstDeliveryDate,
        l.lastDeliveryDate,
      ]),
    ).toEqual([
      [120_000, 15, 1800, "2026-10-02", "2026-10-05"],
      [130_000, 4, 520, "2026-10-20", "2026-10-20"],
    ]);
    expectGapsExplainDifference(dossier);
  });

  it("un changement de taux fait deux lignes ; « 5.5 » et « 5.50 » ne font qu'une clé", () => {
    const dossier = simulateInvoiceDossier([
      bon({ lines: [{ ...BAGUETTE, price: 100_000, qty: 1 }] }),
      bon({ lines: [{ sku: "BAG-001", rate: "5.5", price: 100_000, qty: 2 }] }),
      bon({ lines: [{ sku: "BAG-001", rate: "10.00", price: 100_000, qty: 3 }] }),
    ]);

    expect(dossier.invoice.lines.map((l) => [l.vatRate, l.quantity])).toEqual([
      [5.5, 3],
      [10, 3],
    ]);
    expect(
      dossier.invoice.vat.categories.map((c) => [c.rate, c.taxableBaseCents, c.vatCents]),
    ).toEqual([
      [5.5, 300, 17],
      [10, 300, 30],
    ]);
  });

  it("prend le libellé du bon le plus récent et dit les autres", () => {
    const dossier = simulateInvoiceDossier([
      bon({ lines: [{ ...BAGUETTE, name: "Baguette", price: 100_000, qty: 1 }], placedSeq: 1 }),
      bon({
        lines: [{ ...BAGUETTE, name: "Baguette tradition", price: 100_000, qty: 1 }],
        placedSeq: 3,
      }),
      bon({
        lines: [{ ...BAGUETTE, name: "Baguette blanche", price: 100_000, qty: 1 }],
        placedSeq: 2,
      }),
    ]);

    expect(dossier.invoice.lines[0]).toMatchObject({
      label: "Baguette tradition",
      otherLabels: ["Baguette", "Baguette blanche"],
    });
  });

  it("une clé dont aucun bon ne porte de date n'a pas de période", () => {
    const dossier = simulateInvoiceDossier([
      bon({ lines: [{ ...BAGUETTE, price: 100_000, qty: 1 }] }),
    ]);

    expect(dossier.invoice.lines[0]).toMatchObject({
      firstDeliveryDate: null,
      lastDeliveryDate: null,
    });
  });
});

describe("simulateInvoiceDossier — remises, frais, livraison", () => {
  it("additionne les remises par nature, exactement", () => {
    const dossier = simulateInvoiceDossier([
      bon({ lines: [{ ...BAGUETTE, price: 1_000_000, qty: 1 }], discount: 100, voucher: 30 }),
      bon({ lines: [{ ...BAGUETTE, price: 1_000_000, qty: 1 }], discount: 50 }),
    ]);

    expect(dossier.invoice).toMatchObject({ companyDiscountCents: 150, voucherDiscountCents: 30 });
    expectGapsExplainDifference(dossier);
  });

  it("un cycle qui mêle les deux modes fait deux lignes de livraison ; `null` se lit taux normal", () => {
    const croissant = { sku: "CRO-001", rate: "5.50", price: 1_000_000, qty: 1 } as const;
    const tote = { sku: "SAC-001", rate: "20.00", price: 1_000_000, qty: 1 } as const;
    const dossier = simulateInvoiceDossier([
      bon({ lines: [croissant, tote], delivery: 500, mode: null }),
      bon({ lines: [croissant], delivery: 300, mode: "standard" }),
      bon({ lines: [croissant, tote], delivery: 600, mode: "follows_goods" }),
    ]);

    expect(dossier.invoice.deliveries).toEqual([
      { mode: "standard", amountCents: 800 },
      { mode: "follows_goods", amountCents: 600 },
    ]);
    // Le port qui suit la vente se répartit sur les bases DE SON bon (1000 / 1000) : 300 / 300.
    expect(dossier.invoice.vat.categories.map((c) => [c.rate, c.charges])).toEqual([
      [
        5.5,
        [
          { key: "delivery_standard", amountCents: 0 },
          { key: "delivery_follows_goods", amountCents: 300 },
        ],
      ],
      [
        20,
        [
          { key: "delivery_standard", amountCents: 800 },
          { key: "delivery_follows_goods", amountCents: 300 },
        ],
      ],
    ]);
    expectGapsExplainDifference(dossier);
  });

  it("arrête le dossier sur une surtaxe sans taux, en nommant le bon", () => {
    const orders = [
      bon({ lines: [{ ...BAGUETTE, price: 100_000, qty: 1 }] }),
      bon({ lines: [{ ...BAGUETTE, price: 100_000, qty: 1 }], lateFee: 200, lateRate: null }),
    ];
    const reference = orders[1]?.reference ?? "";

    expect(() => simulateInvoiceDossier(orders)).toThrow(InvoiceDossierLateFeeRateMissingError);
    expect(() => simulateInvoiceDossier(orders)).toThrow(reference);
  });
});

describe("simulateInvoiceDossier — les trois écarts", () => {
  /**
   * 3 bons d'une ligne à 0,33333 € : chacun arrondit 33,333 → 33, la facture
   * arrondit 99,999 → 100. Un centime d'écart d'arrondi de ligne.
   */
  it("range l'arrondi des lignes par clé", () => {
    const line = { ...BAGUETTE, price: 33_333, qty: 1 };
    const dossier = simulateInvoiceDossier([
      bon({ lines: [line] }),
      bon({ lines: [line] }),
      bon({ lines: [line] }),
    ]);

    expect(dossier.gaps.lineRounding).toEqual([
      { sku: "BAG-001", unitPriceMillicents: 33_333, vatRate: 5.5, gapCents: 1 },
    ]);
    expect(dossier.gaps.lineRoundingCents).toBe(1);
    expect(dossier.differenceCents).not.toBe(0);
    expectGapsExplainDifference(dossier);
  });

  /**
   * Deux bons de 9 € à 5,5 % : 49,5 → 50 chacun, 100 au total ; la facture
   * taxe 1800 une fois : 99. Un centime d'arrondi de la TVA, en moins.
   */
  it("range l'arrondi de la TVA par taux, bons ventilés seulement", () => {
    const line = { ...BAGUETTE, price: 900_000, qty: 1 };
    const dossier = simulateInvoiceDossier([bon({ lines: [line] }), bon({ lines: [line] })]);

    expect(dossier.gaps.vatRounding).toEqual([
      { rate: 5.5, invoiceVatCents: 99, ordersVatCents: 100, gapCents: -1 },
    ]);
    expect(dossier.gaps.unventilatedVat).toEqual({
      invoiceVatCents: 0,
      ordersVatCents: 0,
      gapCents: 0,
    });
    expect(dossier.differenceCents).toBe(-1);
    expectGapsExplainDifference(dossier);
  });

  it("met la TVA des bons sans ventilation à part, hors des écarts par taux", () => {
    const line = { ...BAGUETTE, price: 900_000, qty: 1 };
    const dossier = simulateInvoiceDossier([
      bon({ lines: [line] }),
      bon({ lines: [line], ventilated: false }),
      bon({ lines: [line], ventilated: false }),
    ]);

    // Facture : 2700 × 5,5 % = 148,5 → 149. Non ventilés seuls : 1800 → 99,
    // contre 50 + 50 annoncés. Le reste (149 − 99 = 50) contre la part ventilée (50).
    expect(dossier.gaps.unventilatedVat).toEqual({
      invoiceVatCents: 99,
      ordersVatCents: 100,
      gapCents: -1,
    });
    expect(dossier.gaps.vatRounding).toEqual([
      { rate: 5.5, invoiceVatCents: 50, ordersVatCents: 50, gapCents: 0 },
    ]);
    expectGapsExplainDifference(dossier);
  });

  it("tient l'invariant sur un dossier qui mêle tout", () => {
    const dossier = simulateInvoiceDossier([
      bon({
        lines: [
          { ...BAGUETTE, price: 33_333, qty: 7 },
          { sku: "QUI-001", rate: "10.00", price: 456_789, qty: 3 },
        ],
        discount: 123,
        voucher: 45,
        delivery: 790,
        mode: "follows_goods",
        lateFee: 150,
        lateRate: 10,
        date: "2026-10-03",
      }),
      bon({
        lines: [
          { ...BAGUETTE, price: 33_333, qty: 2 },
          { sku: "SAC-001", rate: "20", price: 99_999, qty: 1 },
        ],
        discount: 17,
        delivery: 500,
        ventilated: false,
      }),
      bon({
        lines: [{ sku: "QUI-001", rate: "10", price: 456_789, qty: 1 }],
        voucher: 11,
        delivery: 333,
        mode: "standard",
        lateFee: 99,
        lateRate: 20,
      }),
    ]);

    expectGapsExplainDifference(dossier);
  });
});
