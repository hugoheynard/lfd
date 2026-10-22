import { SiteResupply } from "../site-resupply.js";
import { SiteResupplyLine } from "../site-resupply-line.js";

/**
 * « Parti » (R4d) : un affichage posé une fois, sur un réassort envoyé, qui
 * ne refuse rien. Des instants comparés entre eux seulement.
 */
const PLACED_AT = new Date(1_000);
const DEPARTED_AT = new Date(5_000);
const LATER = new Date(9_000);
const LOU = { staffUserId: "staff_lou", name: "Lou", role: "counter" };

function draft(): SiteResupply {
  const resupply = SiteResupply.draft({
    id: "rs1",
    siteId: "site_1",
    target: "asap",
    at: PLACED_AT,
  });
  resupply.addLine(SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 12 }));
  return resupply;
}

function placed(): SiteResupply {
  const resupply = draft();
  resupply.place({ at: PLACED_AT, author: LOU }, null, false);
  return resupply;
}

describe("SiteResupply.recordDeparture (R4d)", () => {
  it("pose « parti » sur un réassort envoyé", () => {
    const resupply = placed();

    expect(resupply.recordDeparture({ at: DEPARTED_AT, byName: "Léa" })).toBe(true);
    expect(resupply.departed).toEqual({ at: DEPARTED_AT, byName: "Léa" });
  });

  it("ne réécrit pas un départ déjà posé", () => {
    const resupply = placed();
    resupply.recordDeparture({ at: DEPARTED_AT, byName: "Léa" });

    expect(resupply.recordDeparture({ at: LATER, byName: "Max" })).toBe(false);
    expect(resupply.departed?.at).toEqual(DEPARTED_AT);
  });

  it("ignore une demande en cours ou un réassort annulé", () => {
    const cancelled = placed();
    cancelled.cancel({ at: LATER, author: LOU }, null, false, false);

    expect(draft().recordDeparture({ at: DEPARTED_AT, byName: null })).toBe(false);
    expect(cancelled.recordDeparture({ at: DEPARTED_AT, byName: null })).toBe(false);
  });

  it("ne refuse ni l'arrivée ni le « Monté » qui suivent", () => {
    const resupply = placed();
    resupply.recordDeparture({ at: DEPARTED_AT, byName: null });

    expect(resupply.markArrived({ at: LATER, author: LOU }, null)).toBe(true);
  });
});
