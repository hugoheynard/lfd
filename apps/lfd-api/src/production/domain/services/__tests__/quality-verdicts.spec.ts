import { QualityCheck, type QualityVerdict } from "../../entities/quality-check.js";
import type { QualityCheckTargetInput } from "../../value-objects/quality-check-target.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import {
  currentChecks,
  heldOrderIds,
  isStale,
  type PlannedOrderLine,
} from "../quality-verdicts.js";

/**
 * Verdict courant, péremption et retenue — fonctions pures, contrôles construits
 * par la factory du domaine. Les instants ne sont comparés qu'entre eux.
 */

const DAY = ServiceDay.of("2026-10-01");
const OTHER_DAY = ServiceDay.of("2026-10-02");
const BASE = new Date().getTime();
const MINUTE = 60_000;

let sequence = 0;

function check(
  target: QualityCheckTargetInput,
  verdict: QualityVerdict,
  minutesAfter: number,
  serviceDay: ServiceDay = DAY,
): QualityCheck {
  sequence += 1;
  return QualityCheck.render({
    id: `01JQC${String(sequence).padStart(21, "0")}`,
    serviceDay,
    target,
    verdict,
    note: verdict === "ok" ? null : "Vu au contrôle",
    checkedBy: "staff_1",
    checkedAt: new Date(BASE + minutesAfter * MINUTE),
    photos: [],
  });
}

const croissants = (quantitySeen = 96): QualityCheckTargetInput => ({
  kind: "line",
  sku: "VIE-001",
  quantitySeen,
});
const order = (orderId: string): QualityCheckTargetInput => ({ kind: "order", orderId });

const PLAN: readonly PlannedOrderLine[] = [
  { orderId: "ord_a", sku: "VIE-001" },
  { orderId: "ord_a", sku: "PAIN-002" },
  { orderId: "ord_b", sku: "VIE-001" },
  { orderId: "ord_c", sku: "PAIN-002" },
];

describe("currentChecks — le plus récent l'emporte (D2)", () => {
  it("garde le dernier verdict de chaque cible, quel que soit l'ordre reçu", () => {
    const blocked = check(croissants(), "blocking", 0);
    const lifted = check(croissants(), "ok", 10);
    const onOrder = check(order("ord_a"), "warning", 5);
    const current = currentChecks([lifted, onOrder, blocked]);
    expect(current.get("line:VIE-001")).toBe(lifted);
    expect(current.get("order:ord_a")).toBe(onOrder);
    expect(current.size).toBe(2);
  });

  it("à instant égal, l'id (ULID) départage", () => {
    const first = check(croissants(), "blocking", 0);
    const second = check(croissants(), "ok", 0);
    expect(currentChecks([second, first]).get("line:VIE-001")).toBe(second);
  });
});

describe("isStale — un contrôle de ligne se périme (D5)", () => {
  it("dit « à revoir » quand le compte a changé, pas sinon", () => {
    const seen = check(croissants(96), "ok", 0);
    expect(isStale(seen, 96)).toBe(false);
    expect(isStale(seen, 120)).toBe(true);
  });

  it("un contrôle de commande ne se périme jamais", () => {
    expect(isStale(check(order("ord_a"), "ok", 0), 120)).toBe(false);
  });
});

describe("heldOrderIds — la règle de retenue (D4, D6)", () => {
  it("rien de retenu sans blocage", () => {
    const checks = [check(croissants(), "warning", 0), check(order("ord_c"), "ok", 0)];
    expect([...heldOrderIds(DAY, checks, PLAN)]).toEqual([]);
  });

  it("un blocage de commande retient cette commande, et elle seule", () => {
    expect([...heldOrderIds(DAY, [check(order("ord_c"), "blocking", 0)], PLAN)]).toEqual(["ord_c"]);
  });

  it("un blocage de ligne retient toutes les commandes du plan qui portent ce SKU", () => {
    const held = heldOrderIds(DAY, [check(croissants(), "blocking", 0)], PLAN);
    expect([...held].sort()).toEqual(["ord_a", "ord_b"]);
  });

  it("une commande hors plan n'est pas retenue par un blocage de ligne (assumé, D6)", () => {
    const held = heldOrderIds(DAY, [check(croissants(), "blocking", 0)], PLAN);
    expect(held.has("ord_late")).toBe(false);
  });

  it("un nouveau verdict lève le blocage", () => {
    const checks = [check(croissants(), "blocking", 0), check(croissants(), "warning", 5)];
    expect(heldOrderIds(DAY, checks, PLAN).size).toBe(0);
  });

  it("🔴 un blocage périmé RESTE bloquant : le compte a changé, pas le jugement", () => {
    const blocked = check(croissants(96), "blocking", 0);
    expect(isStale(blocked, 120)).toBe(true);
    expect([...heldOrderIds(DAY, [blocked], PLAN)].sort()).toEqual(["ord_a", "ord_b"]);
  });

  it("un OK sur la commande ne lève pas le blocage de sa ligne", () => {
    const checks = [check(croissants(), "blocking", 0), check(order("ord_a"), "ok", 5)];
    expect(heldOrderIds(DAY, checks, PLAN).has("ord_a")).toBe(true);
  });

  it("ignore les contrôles d'une autre journée", () => {
    const checks = [check(order("ord_c"), "blocking", 0, OTHER_DAY)];
    expect(heldOrderIds(DAY, checks, PLAN).size).toBe(0);
  });
});
