import { lineTotalCents } from "@lfd/money";

import type { CollectableOrder } from "../../ports/collection-candidates.reader.js";
import { assembleCollection, type AssemblyInput } from "../collection-assembly.js";
import { isBillable } from "../invoice-billability.js";
import { simulateInvoiceDossier } from "../invoice-dossier.js";
import type { FrozenInvoiceOrder } from "../invoice-dossier.types.js";
import { ENTITY_ID, SEPTEMBER, frozenOrder, mandate, order } from "./collection-fixtures.js";

/**
 * Le prélèvement suit la facture (plan `plan-le-prelevement-suit-la-facture.md`,
 * F2) : une ligne prélève le total de la facture de SES bons, et un bon qu'on
 * ne sait pas facturer sort du lot sans bloquer les autres. Aucune horloge lue.
 */

const AT = new Date("2026-10-02T09:00:00.000Z");
/**
 * 10,5 c HT : chaque bon arrondit à 11 c et porte 1 c de TVA. La facture de
 * deux bons reprend 22 c de HT (F6, 2026-10-08) et taxe 22 c une fois : 1 c.
 */
const HALF_CENT_PRICE = 10_500;

function input(orders: readonly CollectableOrder[]): AssemblyInput {
  return {
    legalEntityId: ENTITY_ID,
    at: AT,
    cycleStartsAt: SEPTEMBER.startsAt,
    orders,
    follows: [],
    mandates: [mandate("c_port"), mandate("c_quai")],
    collectionForms: new Map(),
    consumedMandates: new Set(),
    companyNames: new Map([
      ["c_port", "Boulangerie du Port"],
      ["c_quai", "Café du Quai"],
    ]),
    liveSchemes: [],
    invoices: new Map(),
    invoicingFloor: null,
  };
}

/** Un bon cohérent dont la TVA arrondie par bon diffère de celle de l'agrégat. */
function halfCentOrder(companyId: string): CollectableOrder {
  const base = order(companyId);
  const goods = lineTotalCents(HALF_CENT_PRICE, 1);
  const vat = 1;
  const frozen: FrozenInvoiceOrder = {
    ...base.frozen,
    lines: [
      { ...firstLine(base.frozen), unitPriceMillicents: HALF_CENT_PRICE, lineTotalCents: goods },
    ],
    vatShares: [{ rate: 5.5, amountCents: vat }],
    vatCents: vat,
    totalCents: goods + vat,
  };
  return { ...base, totalCents: frozen.totalCents, frozen };
}

function firstLine(frozen: FrozenInvoiceOrder): FrozenInvoiceOrder["lines"][number] {
  const [line] = frozen.lines;
  if (line === undefined) {
    throw new TypeError("la fixture porte une ligne");
  }
  return line;
}

function withFrozen(
  companyId: string,
  change: (frozen: FrozenInvoiceOrder) => FrozenInvoiceOrder,
): CollectableOrder {
  const base = order(companyId);
  return { ...base, frozen: change(base.frozen) };
}

function debitsOf(result: ReturnType<typeof assembleCollection>) {
  return result.debits.get("B2B") ?? [];
}

describe("assembleCollection — le montant d'une ligne est le total de sa facture", () => {
  it("prélève le total de la facture calculée en une fois, et garde la somme des bons à côté", () => {
    const orders = [halfCentOrder("c_port"), halfCentOrder("c_port")];

    const [line] = debitsOf(assembleCollection(input(orders)));

    const dossier = simulateInvoiceDossier(orders.map((o) => o.frozen));
    expect(line?.amountCents).toBe(dossier.invoice.totalCents);
    expect(line?.ordersTotalCents).toBe(24);
    // 22 c HT repris des bons + 1 c de TVA calculée une fois, contre 2 c sur
    // les bons : la facture compte un centime de moins (avant F6 : deux, le
    // HT recalculé arrondissait 21 c).
    expect(line?.amountCents).toBe(23);
    expect((line?.amountCents ?? 0) - (line?.ordersTotalCents ?? 0)).toBe(-1);
  });

  it("calcule la facture de CHAQUE ligne sur ses seuls bons", () => {
    const port = [halfCentOrder("c_port"), halfCentOrder("c_port")];
    const quai = [halfCentOrder("c_quai")];

    const lines = debitsOf(assembleCollection(input([...port, ...quai])));

    const byPayer = new Map(lines.map((line) => [line.payerId, line]));
    expect(byPayer.get("c_port")?.amountCents).toBe(23);
    expect(byPayer.get("c_quai")?.amountCents).toBe(12);
  });

  it("facture normalement un bon non ventilé (`vatShares` nul)", () => {
    const unventilated = withFrozen("c_port", (frozen) => ({ ...frozen, vatShares: null }));

    const result = assembleCollection(input([unventilated]));

    expect(result.exclusions).toEqual([]);
    expect(debitsOf(result)[0]?.amountCents).toBe(
      simulateInvoiceDossier([unventilated.frozen]).invoice.totalCents,
    );
  });
});

describe("assembleCollection — un bon qu'on ne sait pas facturer est écarté, pas bloquant", () => {
  it("écarte `unbillable` un bon incohérent, et prélève les autres du même payeur", () => {
    const sound = order("c_port");
    const inconsistent = withFrozen("c_port", (frozen) => ({ ...frozen, totalCents: 990 }));

    const result = assembleCollection(input([sound, inconsistent]));

    expect(result.exclusions).toEqual([{ order: inconsistent, reason: "unbillable" }]);
    const [line] = debitsOf(result);
    expect(line?.orders.map((o) => o.orderId)).toEqual([sound.orderId]);
    expect(line?.amountCents).toBe(1_000);
  });

  it("écarte `unbillable` un bon à surtaxe sans taux, sans bloquer l'autre payeur", () => {
    const noRate = withFrozen("c_port", (frozen) => ({
      ...frozen,
      lateFeeCents: 100,
      lateFeeVatRate: null,
      totalCents: frozen.totalCents + 100,
    }));
    const other = order("c_quai");

    const result = assembleCollection(input([noRate, other]));

    expect(result.exclusions.map((e) => [e.order.orderId, e.reason])).toEqual([
      [noRate.orderId, "unbillable"],
    ]);
    expect(debitsOf(result).map((line) => line.payerId)).toEqual(["c_quai"]);
  });

  it("écarte `unbillable` un bon au taux de ligne illisible", () => {
    const unreadable = withFrozen("c_port", (frozen) => ({
      ...frozen,
      lines: [{ ...firstLine(frozen), vatRate: "n/a" }],
    }));

    const result = assembleCollection(input([unreadable]));

    expect(result.exclusions.map((e) => e.reason)).toEqual(["unbillable"]);
    expect(result.debits.size).toBe(0);
  });

  it("n'écarte pas un bon non facturable qui appartient au lot d'une autre entité", () => {
    const elsewhere = withFrozen("c_port", (frozen) => ({ ...frozen, totalCents: 990 }));

    const result = assembleCollection({
      ...input([elsewhere]),
      mandates: [mandate("c_port", { creditorId: "le_other" })],
    });

    expect(result.exclusions).toEqual([]);
    expect(result.debits.size).toBe(0);
  });
});

describe("isBillable — un bon jugé seul", () => {
  it("accepte un bon cohérent, ventilé ou non", () => {
    const frozen = frozenOrder("CMD-X", AT);
    expect(isBillable(frozen)).toBe(true);
    expect(isBillable({ ...frozen, vatShares: null })).toBe(true);
  });

  it("refuse un bon dont le total ne se recompose pas", () => {
    expect(isBillable({ ...frozenOrder("CMD-X", AT), totalCents: 1_001 })).toBe(false);
  });
});
