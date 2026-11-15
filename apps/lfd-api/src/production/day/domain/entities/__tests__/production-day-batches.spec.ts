import type { ProducibleOrder } from "../../../../channels/commerce/day-orders.reader.js";
import {
  BatchConflictError,
  BatchNotFoundError,
  InvalidBatchQuantityError,
} from "../../errors/batch-errors.js";
import {
  ProducedItemNotFoundError,
  ProductionDayNotClosedError,
} from "../../errors/production-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay, type ProductionBatchSnapshot } from "../production-day.js";

/**
 * **Les fournées dans la journée** (plan `la-fiche-d-atelier.md`, D3,
 * D4) — l'agrégat seul, sans Nest ni base.
 *
 * Ces instants ne sont que recopiés et comparés entre eux, jamais à l'horloge.
 */
const AT = new Date("2026-09-13T04:20:00.000Z");
const FIVE = new Date("2026-09-13T05:00:00.000Z");
const DAY = "2026-09-13";
const SKU = "VIE-001";
const MARK = { at: FIVE, by: "staff-1", initials: "MB" };

/** Deux bacs de 12 croissants : 24 au compte. */
const ORDERS: readonly ProducibleOrder[] = ["1", "2"].map((n) => ({
  orderId: `ord_${n}`,
  reference: `ORD-000${n}`,
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  clientele: null,
  siteId: null,
  sheetDetails: null,
  lines: [
    { sku: SKU, productName: "Croissant", quantity: 12, saleUnit: "piece", madeToOrder: null },
  ],
}));

function batch(id: string, quantity: number, cancelled = false): ProductionBatchSnapshot {
  return {
    id,
    sku: SKU,
    quantity,
    recorded: MARK,
    cancelled: cancelled ? { at: FIVE, by: "staff-2" } : null,
    returned: 0,
    pendingReturn: 0,
  };
}

/** La journée arrêtée, avec ses fournées. */
function day(batches: readonly ProductionBatchSnapshot[]): ProductionDay {
  const open = ProductionDay.open(ServiceDay.of(DAY));
  open.close(ORDERS, new Set<string>(), AT, null);
  const snapshot = open.toSnapshot();
  return ProductionDay.fromSnapshot({ ...snapshot, batches });
}

describe("déclarer une fournée", () => {
  it("rend la fournée, sans rien muter", () => {
    const current = day([]);

    expect(current.batchToRecord("id-1", SKU, 12, MARK)).toEqual(batch("id-1", 12));
    expect(current.batches).toEqual([]);
  });

  it("refuse moins d'une pièce ou une fraction", () => {
    expect(() => day([]).batchToRecord("id-1", SKU, 0, MARK)).toThrow(InvalidBatchQuantityError);
    expect(() => day([]).batchToRecord("id-1", SKU, 1.5, MARK)).toThrow(InvalidBatchQuantityError);
  });

  it("porte les refus d'`itemToMark` : journée ouverte, SKU hors compte", () => {
    const open = ProductionDay.open(ServiceDay.of(DAY));
    expect(() => open.batchToRecord("id-1", SKU, 1, MARK)).toThrow(ProductionDayNotClosedError);
    expect(() => day([]).batchToRecord("id-1", "INCONNU", 1, MARK)).toThrow(
      ProducedItemNotFoundError,
    );
  });

  it("un rejeu de la même charge est admis, même annulé ; une autre charge non", () => {
    const current = day([]);
    const requested = batch("id-1", 12);

    expect(() => current.acknowledge(requested, DAY, batch("id-1", 12, true))).not.toThrow();
    expect(() => current.acknowledge(requested, DAY, batch("id-1", 18))).toThrow(
      BatchConflictError,
    );
    expect(() => current.acknowledge(requested, "2026-09-14", requested)).toThrow(
      BatchConflictError,
    );
  });
});

describe("annuler une fournée (D3)", () => {
  it("rend la fournée à annuler, et `null` si elle l'est déjà", () => {
    expect(day([batch("a", 12)]).batchToCancel("a")?.id).toBe("a");
    expect(day([batch("a", 12, true)]).batchToCancel("a")).toBeNull();
  });

  it("une fournée inconnue ce jour-là est introuvable", () => {
    expect(() => day([]).batchToCancel("nope")).toThrow(BatchNotFoundError);
  });
});

describe("« sorti » se lit sur les seules fournées", () => {
  it("Σ des fournées actives : une fournée annulée ne compte pas", () => {
    expect(day([batch("a", 10), batch("b", 2, true), batch("c", 14)]).producedOf(SKU)).toBe(24);
  });

  it("une ligne sans fournée n'a rien sorti, quoi qu'en dise l'ancienne coche", () => {
    expect(day([]).producedOf(SKU)).toBe(0);
  });
});
