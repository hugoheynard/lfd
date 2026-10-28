import { grams, lineTotalCents, pieces, type SaleUnit } from "@lfd/money";

import { InvoiceDossierMixedSaleUnitError } from "../../errors/invoice-dossier-errors.js";
import { aggregateInvoiceLines } from "../invoice-lines.js";
import type { FrozenInvoiceLine, FrozenInvoiceOrder } from "../invoice-dossier.types.js";

/**
 * L'agrégation d'une facture au poids (plan `plan-vente-au-poids.md`, § 3 bis,
 * point 2) : les grammes deviennent des millièmes de kilogramme (`KGM`), les
 * pièces des millièmes de pièce (`H87`), une fois, ici. Aucune horloge lue.
 */

/** 12,40 € HT le kilo. */
const PER_KILO = 1_240_000;
/** 1,00 € HT la pièce. */
const PER_PIECE = 100_000;

function lineOf(sku: string, amount: number, saleUnit: SaleUnit, price: number): FrozenInvoiceLine {
  const quantity = saleUnit === "weight" ? grams(amount) : pieces(amount);
  return {
    sku,
    productNameSnapshot: sku,
    unitPriceMillicents: price,
    vatRate: "5.50",
    quantity: amount,
    saleUnit,
    lineTotalCents: lineTotalCents(price, quantity),
  };
}

function bonOf(reference: string, lines: readonly FrozenInvoiceLine[]): FrozenInvoiceOrder {
  const total = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return {
    reference,
    createdAt: new Date(0),
    requestedDeliveryDate: null,
    lines,
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: null,
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: null,
    vatCents: 0,
    totalCents: total,
  };
}

describe("aggregateInvoiceLines — la vente au poids", () => {
  it("1 250 g font 1 250 millièmes de KGM, jamais 1 250 000 (des tonnes)", () => {
    const [line] = aggregateInvoiceLines([
      bonOf("ORD-1", [lineOf("GRAV", 1_250, "weight", PER_KILO)]),
    ]);

    expect(line).toMatchObject({
      unitCode: "KGM",
      quantityThousandths: 1_250,
      unitPriceMillicents: PER_KILO,
      amountCents: 1_550,
    });
  });

  it("une commande mêlée : la pièce en H87, le poids en KGM, chacun sa ligne", () => {
    const lines = aggregateInvoiceLines([
      bonOf("ORD-1", [
        lineOf("GRAV", 500, "weight", PER_KILO),
        lineOf("PAIN", 3, "piece", PER_PIECE),
      ]),
    ]);

    expect(lines.map((l) => [l.sku, l.unitCode, l.quantityThousandths, l.amountCents])).toEqual([
      ["GRAV", "KGM", 500, 620],
      ["PAIN", "H87", 3_000, 300],
    ]);
  });

  it("les grammes de plusieurs bons s'additionnent, le montant reste Σ des bons", () => {
    const lines = aggregateInvoiceLines([
      bonOf("ORD-1", [lineOf("GRAV", 1_001, "weight", 1_234_567)]),
      bonOf("ORD-2", [lineOf("GRAV", 1_001, "weight", 1_234_567)]),
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantityThousandths: 2_002, amountCents: 2 * 1_236 });
  });

  it("1 g, le plus petit poids, fait 1 millième de KGM", () => {
    const [line] = aggregateInvoiceLines([bonOf("ORD-1", [lineOf("GRAV", 1, "weight", PER_KILO)])]);

    expect(line).toMatchObject({ unitCode: "KGM", quantityThousandths: 1, amountCents: 1 });
  });

  it("une tonne (la garde de saisie) fait 1 000 000 millièmes, sans dépasser l'entier sûr", () => {
    const [line] = aggregateInvoiceLines([
      bonOf("ORD-1", [lineOf("GRAV", 1_000_000, "weight", PER_KILO)]),
    ]);

    expect(line).toMatchObject({ quantityThousandths: 1_000_000, amountCents: 1_240_000 });
  });

  it("refuse un même article à la pièce dans un bon et au poids dans un autre, en nommant le bon", () => {
    const orders = [
      bonOf("ORD-1", [lineOf("GRAV", 2, "piece", PER_PIECE)]),
      bonOf("ORD-2", [lineOf("GRAV", 500, "weight", PER_KILO)]),
    ];

    expect(() => aggregateInvoiceLines(orders)).toThrow(InvoiceDossierMixedSaleUnitError);
    expect(() => aggregateInvoiceLines(orders)).toThrow(/GRAV.*ORD-2/u);
  });

  it("refuse le mélange même quand le prix diffère — la clé seule ne l'aurait pas vu", () => {
    const orders = [
      bonOf("ORD-1", [
        lineOf("GRAV", 500, "weight", PER_KILO),
        lineOf("GRAV", 1, "piece", PER_KILO),
      ]),
    ];

    expect(() => aggregateInvoiceLines(orders)).toThrow(InvoiceDossierMixedSaleUnitError);
  });
});
