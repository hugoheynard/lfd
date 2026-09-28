import { QualityCheck, type QualityVerdict } from "../../entities/quality-check.js";
import type { QualityCheckTargetInput } from "../../value-objects/quality-check-target.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { holdTransition } from "../quality-holds.js";

const DAY = ServiceDay.of("2026-10-01");
const START = new Date();
const PLAN = [
  { orderId: "ord_1", sku: "VIE-001" },
  { orderId: "ord_2", sku: "VIE-001" },
  { orderId: "ord_2", sku: "PAI-001" },
];
const LINE: QualityCheckTargetInput = { kind: "line", sku: "VIE-001", quantitySeen: 16 };

function check(id: string, verdict: QualityVerdict, offsetMs: number, target = LINE): QualityCheck {
  return QualityCheck.render({
    id,
    serviceDay: DAY,
    target,
    verdict,
    note: verdict === "ok" ? null : "vu",
    checkedBy: "staff_sup",
    checkedAt: new Date(START.getTime() + offsetMs),
    photos: [],
  });
}

describe("holdTransition (D9)", () => {
  it("un premier blocage de ligne pose la retenue sur les commandes du plan qui portent le SKU", () => {
    expect(holdTransition([], check("a", "blocking", 0), PLAN)).toEqual({
      kind: "raised",
      heldOrderIds: ["ord_1", "ord_2"],
    });
  });

  it("un blocage de commande ne retient qu'elle", () => {
    const order = check("a", "blocking", 0, { kind: "order", orderId: "ord_9" });
    expect(holdTransition([], order, PLAN)).toEqual({ kind: "raised", heldOrderIds: ["ord_9"] });
  });

  it("un OK ou une réserve après un blocage le lève", () => {
    const blocked = [check("a", "blocking", 0)];
    expect(holdTransition(blocked, check("b", "ok", 1000), PLAN)).toEqual({ kind: "lifted" });
    expect(holdTransition(blocked, check("c", "warning", 1000), PLAN)).toEqual({ kind: "lifted" });
  });

  it("rien ne change : blocage sur blocage, réserve sur OK, ou verdict plus ancien que le courant", () => {
    expect(
      holdTransition([check("a", "blocking", 0)], check("b", "blocking", 1000), PLAN),
    ).toBeNull();
    expect(holdTransition([check("a", "ok", 0)], check("b", "warning", 1000), PLAN)).toBeNull();
    expect(holdTransition([check("a", "ok", 5000)], check("b", "blocking", 0), PLAN)).toBeNull();
  });

  it("un blocage d'une autre cible ne compte pas", () => {
    const other = check("a", "blocking", 0, { kind: "order", orderId: "ord_1" });
    expect(holdTransition([other], check("b", "ok", 1000), PLAN)).toBeNull();
  });
});
