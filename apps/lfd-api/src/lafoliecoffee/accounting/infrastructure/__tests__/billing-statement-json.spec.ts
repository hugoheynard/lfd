import { STATEMENT_BODY_VERSION } from "../../domain/entities/billing-statement.js";
import type { Invoice, InvoiceLine } from "../../domain/services/invoice-dossier.types.js";
import { bodyJson } from "../billing-statement-json.js";
import { statementBodySchemaOf } from "../billing-statement-json.schema.js";

/**
 * Le corps d'un relevé arrêté, écrit puis relu (plan `vente-au-poids.md`,
 * § 3 bis, point 3) : la v2 porte l'unité et les millièmes, la v1 — sans
 * unité — se relit en pièces. Aucune date n'est comparée à une horloge.
 */

const VAT = {
  categories: [],
  goodsHtCents: 0,
  allowancesCents: 0,
  chargesCents: 0,
  taxableBaseCents: 0,
  vatCents: 0,
  totalCents: 0,
};

function lineOf(overrides: Partial<InvoiceLine>): InvoiceLine {
  return {
    sku: "GRAV-1",
    unitPriceMillicents: 1_240_000,
    vatRate: 5.5,
    label: "Saumon gravlax",
    otherLabels: [],
    unitCode: "KGM",
    quantityThousandths: 1_250,
    amountCents: 1_550,
    ordersLineTotalCents: 1_550,
    firstDeliveryDate: "2026-10-02",
    lastDeliveryDate: "2026-10-02",
    ...overrides,
  };
}

function invoiceOf(lines: readonly InvoiceLine[]): Invoice {
  return {
    lines,
    companyDiscountCents: 0,
    voucherDiscountCents: 0,
    lateFeeCents: 0,
    deliveries: [],
    vat: VAT,
    totalCents: 0,
  };
}

describe("le corps d'un relevé arrêté", () => {
  it("s'écrit en version 2", () => {
    expect(STATEMENT_BODY_VERSION).toBe(2);
  });

  it("v2 : une ligne au poids s'écrit et se relit en KGM, 1 250 millièmes", () => {
    const written = bodyJson(
      invoiceOf([lineOf({}), lineOf({ sku: "PAIN", unitCode: "H87", quantityThousandths: 3_000 })]),
    );

    const read = statementBodySchemaOf(2)?.parse(written);

    expect(read?.lines.map((l) => [l.sku, l.unitCode, l.quantityThousandths])).toEqual([
      ["GRAV-1", "KGM", 1_250],
      ["PAIN", "H87", 3_000],
    ]);
  });

  it("v2 : n'écrit plus de `quantity` dont le sens dépendrait de l'unité", () => {
    expect(JSON.stringify(bodyJson(invoiceOf([lineOf({})])))).not.toContain('"quantity"');
  });

  it("v2 : refuse une ligne sans unité — aucun repli hors de la v1", () => {
    const { unitCode: _unit, ...withoutUnit } = lineOf({});
    const body = { ...invoiceOf([]), lines: [withoutUnit] };

    expect(statementBodySchemaOf(2)?.safeParse(body).success).toBe(false);
  });

  it("v1 (un relevé arrêté avant P7, sans unité) : ses pièces se relisent en H87 × 1 000", () => {
    const { unitCode: _unit, quantityThousandths: _q, ...rest } = lineOf({ sku: "PAIN" });
    const legacy = { ...invoiceOf([]), lines: [{ ...rest, quantity: 3 }] };

    const read = statementBodySchemaOf(1)?.parse(legacy);

    expect(read?.lines[0]).toMatchObject({
      sku: "PAIN",
      unitCode: "H87",
      quantityThousandths: 3_000,
    });
    expect(read?.lines[0]).not.toHaveProperty("quantity");
  });

  it("une version inconnue n'a pas de relecture", () => {
    expect(statementBodySchemaOf(3)).toBeNull();
    expect(statementBodySchemaOf(0)).toBeNull();
  });
});
