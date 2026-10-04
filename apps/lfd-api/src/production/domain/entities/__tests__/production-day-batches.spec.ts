import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import {
  BatchConflictError,
  BatchNotFoundError,
  BatchStillPackedError,
  InvalidBatchQuantityError,
} from "../../errors/batch-errors.js";
import {
  LineNotProducedYetError,
  ProducedItemNotFoundError,
  ProductionDayNotClosedError,
} from "../../errors/production-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { ProductionDay, type ProductionBatchSnapshot } from "../production-day.js";

/**
 * **Les fournées dans la journée** (plan `plan-fournees-progressives.md`, D3,
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
  reference: `CMD-000${n}`,
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  lines: [{ sku: SKU, productName: "Croissant", quantity: 12 }],
}));

function batch(id: string, quantity: number, cancelled = false): ProductionBatchSnapshot {
  return {
    id,
    sku: SKU,
    quantity,
    recorded: MARK,
    cancelled: cancelled ? { at: FIVE, by: "staff-2" } : null,
  };
}

/** La journée arrêtée, avec ses fournées et les bacs déjà remplis. */
function day(
  batches: readonly ProductionBatchSnapshot[],
  packedRefs: readonly string[] = [],
  sealed: readonly string[] = [],
): ProductionDay {
  const open = ProductionDay.open(ServiceDay.of(DAY));
  open.close(ORDERS, AT);
  const snapshot = open.toSnapshot();
  return ProductionDay.fromSnapshot({
    ...snapshot,
    batches,
    orders: snapshot.orders.map((order) => ({
      ...order,
      packed: sealed.includes(order.reference) ? { at: FIVE, by: "staff-2" } : null,
      lines: order.lines.map((line) => ({
        ...line,
        packed: packedRefs.includes(order.reference) ? { ...MARK } : null,
      })),
    })),
  });
}

describe("le disponible et la mise au bac (D4)", () => {
  it("🔴 le premier sac de 12 se remplit dès que 12 sont sortis", () => {
    expect(day([batch("a", 12)]).lineToFill("CMD-0001", SKU).sku).toBe(SKU);
  });

  it("🔴 12 sortis, 12 au bac : le second sac est refusé et le refus dit combien", () => {
    const current = day([batch("a", 12)], ["CMD-0001"]);

    expect(current.availableOf(SKU)).toBe(0);
    expect(() => current.lineToFill("CMD-0002", SKU)).toThrow(LineNotProducedYetError);
    expect(() => current.lineToFill("CMD-0002", SKU)).toThrow("Il manque 12 « Croissant »");
  });

  it("compte les bacs FERMÉS dans ce qui est déjà pris", () => {
    const current = day([batch("a", 20)], ["CMD-0001"], ["CMD-0001"]);

    expect(current.availableOf(SKU)).toBe(8);
    expect(() => current.lineToFill("CMD-0002", SKU)).toThrow("Il manque 4");
  });

  it("une fournée annulée ne compte pas", () => {
    expect(() => day([batch("a", 12, true)]).lineToFill("CMD-0001", SKU)).toThrow(
      LineNotProducedYetError,
    );
  });

  it("recocher une ligne DÉJÀ au bac passe — ses pièces sont déjà comptées", () => {
    expect(day([batch("a", 12)], ["CMD-0001"]).lineToFill("CMD-0001", SKU).sku).toBe(SKU);
  });

  it("ressortir du bac n'est jamais refusé par le four (`lineToPack`)", () => {
    expect(day([], ["CMD-0001"]).lineToPack("CMD-0001", SKU).sku).toBe(SKU);
  });
});

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

  it("🔴 refuse s'il resterait moins de sorti que d'au bac", () => {
    const current = day([batch("a", 12), batch("b", 6)], ["CMD-0001"]);

    // 18 − 6 = 12 ≥ 12 au bac : passe. 18 − 12 = 6 < 12 : refusé.
    expect(current.batchToCancel("b")?.id).toBe("b");
    expect(() => current.batchToCancel("a")).toThrow(BatchStillPackedError);
  });
});

describe("l'ancienne case, traduite", () => {
  it("cocher déclare le reste, sous un id déterministe", () => {
    expect(day([batch("a", 10)]).batchToComplete(SKU, MARK)).toEqual({
      ...batch(`mark-${DAY}-${SKU}-10-1`, 14),
    });
  });

  it("cocher une ligne complète ne déclare rien", () => {
    expect(day([batch("a", 30)]).batchToComplete(SKU, MARK)).toBeNull();
  });

  it("décocher rend les fournées actives, et refuse si des pièces sont au bac", () => {
    expect(day([batch("a", 10), batch("b", 2, true)]).batchesToUncheck(SKU)).toEqual([
      batch("a", 10),
    ]);
    expect(() => day([batch("a", 12)], ["CMD-0001"]).batchesToUncheck(SKU)).toThrow(
      BatchStillPackedError,
    );
  });

  it("matérialise une coche héritée, une seule fois", () => {
    const snapshot = day([]).toSnapshot();
    const legacy = ProductionDay.fromSnapshot({
      ...snapshot,
      counts: snapshot.counts.map((item) => ({ ...item, done: MARK })),
    });

    expect(legacy.availableOf(SKU)).toBe(24);
    expect(legacy.materialize().map((entry) => entry.id)).toEqual([`backfill-${DAY}-${SKU}`]);
    expect(legacy.materialize()).toEqual([]);
    expect(legacy.availableOf(SKU)).toBe(24);
  });
});
