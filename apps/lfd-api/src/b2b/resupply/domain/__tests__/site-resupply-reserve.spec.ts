import {
  EmptyResupplyError,
  ReserveNotTodayError,
  ReserveResupplyNotCancellableError,
} from "../site-resupply-errors.js";
import { SiteResupply } from "../site-resupply.js";
import { SiteResupplyLine } from "../site-resupply-line.js";

/** Plan A1, lot A1.4 — instants comparés entre eux seulement, jamais au mur. */
const SENT_AT = new Date("2026-01-02T08:00:00Z");
const LAUNCHED_AT = new Date("2026-01-02T08:05:00Z");
const LOU = { staffUserId: "staff_lou", name: "Lou", role: "supervisor" };

function fromReserve(
  lines = [SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 4 })],
  reserveDay = "2026-01-02",
): SiteResupply {
  return SiteResupply.sentFromReserve({
    id: "rsp_1",
    siteId: "site_village",
    reserveDay,
    lines,
    trace: { at: SENT_AT, author: LOU },
  });
}

describe("SiteResupply.sentFromReserve — une sortie de réserve", () => {
  it("naît envoyée, « au plus tôt », pour la journée du geste, d'origine `reserve`", () => {
    const resupply = fromReserve();

    expect(resupply).toMatchObject({
      origin: "reserve",
      target: "asap",
      serviceDay: "2026-01-02",
      status: "placed",
      placed: { at: SENT_AT, author: LOU },
    });
  });

  it("additionne un même article donné deux fois", () => {
    const resupply = fromReserve([
      SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 4 }),
      SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 2 }),
    ]);

    expect(resupply.lines.map((line) => [line.sku, line.quantity])).toEqual([["CRO", 6]]);
  });

  it("refuse un envoi sans ligne", () => {
    expect(() => fromReserve([])).toThrow(EmptyResupplyError);
  });

  it("ne part que de la réserve du jour du geste", () => {
    expect(() => fromReserve(undefined, "2026-01-01")).toThrow(ReserveNotTodayError);
    expect(() => fromReserve(undefined, "2026-01-03")).toThrow(ReserveNotTodayError);
  });

  it("ne s'annule pas : le pain est parti", () => {
    const resupply = fromReserve();

    expect(() => resupply.cancel({ at: LAUNCHED_AT, author: LOU }, null, false, false)).toThrow(
      ReserveResupplyNotCancellableError,
    );
    expect(resupply.status).toBe("placed");
  });

  it("ne se lance jamais : le pain est déjà fait", () => {
    const resupply = fromReserve();

    expect(resupply.recordLaunch({ at: LAUNCHED_AT, byName: "Paul" })).toBe(false);
    expect(resupply.launched).toBeNull();
  });
});
