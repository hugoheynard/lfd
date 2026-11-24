import { simulateInvoiceDossier } from "../invoice-dossier.js";
import type { FrozenInvoiceLine } from "../invoice-dossier.types.js";
import type { InvoiceableOrder } from "../monthly-invoicing.js";
import { canonicalJson, periodQuoteFigures } from "../period-quote-fingerprint.js";
import { frozenOrder } from "./collection-fixtures.js";

/**
 * L'empreinte du devis de période (QD5, v5 B1) : ce que la facture de ces
 * commandes imprimerait, haché. Les dates ne sont comparées à aucune horloge :
 * elles sont des données figées des commandes.
 */

const PLACED_AT = new Date("2026-09-15T08:00:00.000Z");
const CROISSANT: FrozenInvoiceLine = {
  sku: "VIE-001-1",
  productNameSnapshot: "Croissant",
  unitPriceMillicents: 90_000,
  vatRate: "5.50",
  quantity: 10,
  saleUnit: "piece",
  lineTotalCents: 900,
};

function order(id: string, overrides: Partial<InvoiceableOrder> = {}): InvoiceableOrder {
  const frozen = frozenOrder(`ORD-${id}`, PLACED_AT);
  return {
    orderId: id,
    orderNumber: `ORD-${id}`,
    companyId: "c_army",
    placedAt: PLACED_AT,
    receivedOn: "2026-09-16",
    billedCompanyId: null,
    frozen: {
      ...frozen,
      lines: [...frozen.lines, CROISSANT],
      vatShares: [{ rate: 5.5, amountCents: 102 }],
      vatCents: 102,
      totalCents: 1_950,
    },
    deliveryNoteNumbers: [`BL-${id}`],
    budgetCommitment: null,
    ...overrides,
  };
}

function withLine(base: InvoiceableOrder, change: Partial<FrozenInvoiceLine>): InvoiceableOrder {
  return {
    ...base,
    frozen: {
      ...base.frozen,
      lines: base.frozen.lines.map((line) =>
        line.sku === CROISSANT.sku ? { ...line, ...change } : line,
      ),
    },
  };
}

describe("periodQuoteFigures — l'empreinte du devis de période", () => {
  it("est un SHA-256 hexadécimal, et le total est le TTC du calcul de la facture", () => {
    const orders = [order("a"), order("b")];

    const figures = periodQuoteFigures(orders);

    expect(figures.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(figures.totalTtcCents).toBe(
      simulateInvoiceDossier(orders.map((one) => one.frozen)).invoice.totalCents,
    );
  });

  it("ne dépend ni de l'ordre des commandes, ni de l'ordre de leurs lignes", () => {
    const a = order("a");
    const reversedLines = { ...a, frozen: { ...a.frozen, lines: [...a.frozen.lines].reverse() } };

    expect(periodQuoteFigures([order("b"), reversedLines]).fingerprint).toBe(
      periodQuoteFigures([a, order("b")]).fingerprint,
    );
  });

  it("change avec une quantité, un prix, un taux de TVA", () => {
    const base = periodQuoteFigures([order("a")]).fingerprint;

    expect(periodQuoteFigures([withLine(order("a"), { quantity: 11 })]).fingerprint).not.toBe(base);
    expect(
      periodQuoteFigures([withLine(order("a"), { unitPriceMillicents: 91_000 })]).fingerprint,
    ).not.toBe(base);
    expect(periodQuoteFigures([withLine(order("a"), { vatRate: "10.00" })]).fingerprint).not.toBe(
      base,
    );
  });

  it("change avec la livraison offerte, le reste d'un reliquat et l'état du solde", () => {
    const base = periodQuoteFigures([order("a")]).fingerprint;

    const offered = order("a", { freeDelivery: { waivedCents: 500, waivedTtcCents: 600 } });
    const remainder = withLine(order("a"), { deliveryDate: "2026-09-20" });
    const unsettled = order("a", { settlement: "unsettled" });

    expect(periodQuoteFigures([offered]).fingerprint).not.toBe(base);
    expect(periodQuoteFigures([remainder]).fingerprint).not.toBe(base);
    expect(periodQuoteFigures([unsettled]).fingerprint).not.toBe(base);
  });

  it("change quand une commande entre ou sort", () => {
    expect(periodQuoteFigures([order("a")]).fingerprint).not.toBe(
      periodQuoteFigures([order("a"), order("b")]).fingerprint,
    );
  });

  it("ne dépend pas de l'engagement : le numéro reçu ne change pas la facture que le devis annonçait", () => {
    const committed = order("a", { budgetCommitment: { number: "1300012345", serviceCode: "" } });

    expect(periodQuoteFigures([committed]).fingerprint).toBe(
      periodQuoteFigures([order("a")]).fingerprint,
    );
  });
});

describe("canonicalJson", () => {
  it("trie les clés à toute profondeur, écrit une date en ISO et omet `undefined`", () => {
    expect(
      canonicalJson({ b: 1, a: { d: new Date("2026-01-02T03:04:05.000Z"), c: undefined } }),
    ).toBe('{"a":{"d":"2026-01-02T03:04:05.000Z"},"b":1}');
  });
});
