import type {
  DoneMark,
  ProducedItemSnapshot,
  ProductionBatchSnapshot,
} from "../../entities/production-day.js";
import {
  activeBatchesOf,
  implicitBatchId,
  implicitBatchesOf,
  outputOf,
} from "../production-output.js";

/**
 * **Les dérivés d'une ligne** (plan `plan-fournees-progressives.md`, D2) et la
 * fournée implicite d'une coche héritée (§5.2) — en fonctions pures.
 *
 * Ces instants ne sont comparés qu'entre eux (l'ordre de sortie), jamais à
 * l'horloge : l'exception étroite du §5.
 */
const FIVE = new Date("2026-09-13T05:00:00.000Z");
const SIX = new Date("2026-09-13T06:00:00.000Z");
const DAY = "2026-09-13";

function batch(
  id: string,
  quantity: number,
  at: Date = FIVE,
  cancelled = false,
): ProductionBatchSnapshot {
  return {
    id,
    sku: "VIE-001",
    quantity,
    recorded: { at, by: "staff-1", initials: "MB" },
    cancelled: cancelled ? { at: SIX, by: "staff-2" } : null,
    returned: 0,
    pendingReturn: 0,
  };
}

function count(quantity: number, done: DoneMark | null): ProducedItemSnapshot {
  return { sku: "VIE-001", productName: "Croissant", quantity, done };
}

describe("outputOf — l'état d'une ligne se DÉDUIT", () => {
  it("rien de sorti : tout reste, rien n'est complet", () => {
    expect(outputOf(48, [])).toEqual({
      produced: 0,
      remaining: 48,
      surplus: 0,
      complete: false,
      completedBy: null,
    });
  });

  it("à moitié : sorti, reste, pas complet", () => {
    expect(outputOf(48, [batch("a", 24)])).toMatchObject({
      produced: 24,
      remaining: 24,
      complete: false,
    });
  });

  it("« 52 / 48 » : le surplus est visible, et la ligne est complète", () => {
    const output = outputOf(48, [batch("a", 24), batch("b", 28, SIX)]);

    expect(output).toMatchObject({ produced: 52, remaining: 0, surplus: 4, complete: true });
    // La fournée qui a FRANCHI la quantité est celle qui date la ligne.
    expect(output.completedBy?.id).toBe("b");
  });
});

describe("activeBatchesOf", () => {
  it("écarte les annulées et les autres SKU, et trie par instant puis id", () => {
    const other = { ...batch("z", 5), sku: "PAI-001" };

    const active = activeBatchesOf(
      [
        batch("c", 1, SIX),
        batch("b", 1, FIVE),
        batch("a", 1, FIVE),
        batch("x", 9, FIVE, true),
        other,
      ],
      "VIE-001",
    );

    expect(active.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("implicitBatchesOf — la coche de l'ancien binaire", () => {
  const coche: DoneMark = { at: FIVE, by: "auth0|karim", initials: "KA" };

  it("vaut une fournée de la quantité, sous l'id du rattrapage", () => {
    expect(implicitBatchesOf(DAY, [count(30, coche)], [])).toEqual([
      {
        id: implicitBatchId(DAY, "VIE-001"),
        sku: "VIE-001",
        quantity: 30,
        recorded: coche,
        cancelled: null,
        returned: 0,
        pendingReturn: 0,
      },
    ]);
    expect(implicitBatchId(DAY, "VIE-001")).toBe(`backfill-${DAY}-VIE-001`);
  });

  it("🔴 disparaît dès qu'une fournée existe pour ce SKU — ANNULÉE comprise", () => {
    // Sinon décocher (qui annule tout) ferait renaître la coche héritée.
    expect(implicitBatchesOf(DAY, [count(30, coche)], [batch("a", 30, FIVE, true)])).toEqual([]);
  });

  it("n'existe pas sans coche", () => {
    expect(implicitBatchesOf(DAY, [count(30, null)], [])).toEqual([]);
  });
});
