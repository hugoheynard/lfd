import { UncarriedInheritedChecksError } from "../../errors/batch-errors.js";
import { NOTHING_PENDING, ProductionDay } from "../production-day.js";
import { AT, LATER, opened, order } from "./production-day-fixtures.js";

/**
 * Régression (audit final du réassort, 2026-11-03) : refaire le compte
 * efface les coches de l'ancien poste (`done_*`) qu'il porte. Seule une
 * phrase de l'adaptateur demandait aux gestes de les matérialiser AVANT ; un
 * geste qui l'oubliait effaçait une coche en silence. Le domaine refuse
 * désormais de refaire le compte par-dessus une coche non reportée.
 */

/** Une journée arrêtée dont la ligne des croissants porte une coche de l'ancien poste. */
function checkedDay(): ProductionDay {
  const day = opened();
  day.close([order()], new Set<string>(), AT, null);
  const snapshot = day.toSnapshot();
  return ProductionDay.restore({
    ...snapshot,
    counts: snapshot.counts.map((item) => ({
      ...item,
      done: { at: AT, by: "staff_four", initials: "MB" },
    })),
  });
}

const VILLAGE = {
  resupplyId: "rs_1",
  siteId: "site_village",
  siteLabel: "Le Village",
  name: null,
  servedByTransfer: true,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece" as const }],
};

const GESTURE = { at: LATER, staffUserId: "staff-1", name: "Marie Dupont" };

describe("refaire le compte d'une journée qui porte une coche de l'ancien poste", () => {
  it("le retirage est refusé tant que la coche n'est pas reportée en fournée", () => {
    const day = checkedDay();

    expect(() =>
      day.retake([order(), order({ orderId: "ord_2" })], new Set<string>(), LATER, "s", null),
    ).toThrow(UncarriedInheritedChecksError);
    expect(day.orders).toHaveLength(1);
  });

  it("la révision d'une commande inscrite est refusée tant que la coche n'est pas reportée", () => {
    const day = checkedDay();

    expect(() => day.reviseOrder("ord_1", [{ sku: "VIE-001", quantity: 50 }])).toThrow(
      UncarriedInheritedChecksError,
    );
  });

  it("le lancement d'un réassort « au plus tôt » est refusé tant que la coche n'est pas reportée", () => {
    const day = checkedDay();

    expect(() => day.launchResupply(VILLAGE, GESTURE, NOTHING_PENDING)).toThrow(
      UncarriedInheritedChecksError,
    );
    expect(day.launchedResupplies).toEqual([]);
  });

  it("le refus nomme l'article dont la coche aurait été effacée", () => {
    expect(() =>
      checkedDay().retake([order({ orderId: "ord_2" })], new Set<string>(), LATER, "s", null),
    ).toThrow("(VIE-001)");
  });

  it("une fois la coche matérialisée, le retirage refait le compte", () => {
    const day = checkedDay();
    const carried = day.materialize();

    const absorbed = day.retake(
      [order(), order({ orderId: "ord_2" })],
      new Set<string>(),
      LATER,
      "s",
      null,
    );

    expect(carried.map((batch) => [batch.sku, batch.quantity])).toEqual([["VIE-001", 40]]);
    expect(absorbed).toBe(1);
    expect(day.producedOf("VIE-001")).toBe(40);
  });

  it("une journée sans coche refait son compte sans rien matérialiser", () => {
    const day = opened();
    day.close([order()], new Set<string>(), AT, null);

    expect(day.retake([order({ orderId: "ord_2" })], new Set<string>(), LATER, "s", null)).toBe(1);
  });
});
