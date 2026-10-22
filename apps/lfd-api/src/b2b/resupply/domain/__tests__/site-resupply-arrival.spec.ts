import { SiteResupply } from "../site-resupply.js";
import {
  ResupplyNotArrivableError,
  ResupplyNotLaunchedNotMountableError,
} from "../site-resupply-errors.js";
import { SiteResupplyLine } from "../site-resupply-line.js";

/**
 * « Réassort arrivé » (lot R3e) : un seul signal, deux gestes — la réception
 * du transfert, « Monté » au fournil. Des instants comparés entre eux
 * seulement, jamais à l'horloge.
 */
const PLACED_AT = new Date(1_000);
const ARRIVED_AT = new Date(5_000);
const LATER = new Date(9_000);
const LOU = { staffUserId: "staff_lou", name: "Lou", role: "counter" };
const PAUL = { staffUserId: "staff_paul", name: "Paul", role: "driver" };

function placed(): SiteResupply {
  const resupply = SiteResupply.draft({
    id: "rs1",
    siteId: "site_1",
    target: "asap",
    at: PLACED_AT,
  });
  resupply.addLine(SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 12 }));
  resupply.place({ at: PLACED_AT, author: LOU }, null, false);
  return resupply;
}

describe("SiteResupply.markArrived", () => {
  it("passe un réassort envoyé d'attendu à arrivé, avec l'instant et l'auteur du geste", () => {
    const resupply = placed();

    expect(resupply.markArrived({ at: ARRIVED_AT, author: PAUL }, null)).toBe(true);

    expect(resupply.arrived).toEqual({ at: ARRIVED_AT, author: PAUL });
    expect(resupply.status).toBe("placed");
  });

  it("déjà arrivé : rien ne change, et l'appelant ne sonne pas une seconde fois", () => {
    const resupply = placed();
    resupply.markArrived({ at: ARRIVED_AT, author: PAUL }, null);

    expect(resupply.markArrived({ at: LATER, author: LOU }, null)).toBe(false);
    expect(resupply.arrived).toEqual({ at: ARRIVED_AT, author: PAUL });
  });

  it("déjà réceptionné : le comptoir a fait foi, le signal n'a plus d'objet", () => {
    const resupply = placed();

    expect(resupply.markArrived({ at: LATER, author: PAUL }, { at: ARRIVED_AT, author: LOU })).toBe(
      false,
    );
    expect(resupply.arrived).toBeNull();
  });

  it("refuse une demande en cours : rien n'est parti", () => {
    const draft = SiteResupply.draft({
      id: "rs2",
      siteId: "site_1",
      target: "asap",
      at: PLACED_AT,
    });

    expect(() => draft.markArrived({ at: ARRIVED_AT, author: PAUL }, null)).toThrow(
      ResupplyNotArrivableError,
    );
  });

  it("refuse un réassort annulé", () => {
    const resupply = placed();
    resupply.cancel({ at: ARRIVED_AT, author: LOU }, null, false, false);

    expect(() => resupply.markArrived({ at: LATER, author: PAUL }, null)).toThrow(
      ResupplyNotArrivableError,
    );
  });

  it("se relit tel qu'écrit", () => {
    const resupply = placed();
    resupply.markArrived({ at: ARRIVED_AT, author: PAUL }, null);

    const restored = SiteResupply.restore({
      id: resupply.id,
      siteId: resupply.siteId,
      target: resupply.target,
      serviceDay: resupply.serviceDay,
      version: 2,
      origin: resupply.origin,
      name: resupply.name,
      lines: resupply.lines,
      placed: resupply.placed,
      cancelled: resupply.cancelled,
      arrived: resupply.arrived,
    });

    expect(restored.arrived).toEqual({ at: ARRIVED_AT, author: PAUL });
  });
});

describe("SiteResupply.markMounted (R4c, Q4 : « Lancer » puis « Monté »)", () => {
  it("refuse un « au plus tôt » que le fournil n'a pas lancé", () => {
    const resupply = placed();

    expect(() => resupply.markMounted({ at: ARRIVED_AT, author: PAUL }, null, false)).toThrow(
      ResupplyNotLaunchedNotMountableError,
    );
    expect(resupply.arrived).toBeNull();
  });

  it("lancé, il passe à arrivé", () => {
    const resupply = placed();

    expect(resupply.markMounted({ at: ARRIVED_AT, author: PAUL }, null, true)).toBe(true);
    expect(resupply.arrived).toEqual({ at: ARRIVED_AT, author: PAUL });
  });

  it("déjà réceptionné, non lancé : le comptoir a fait foi, rien n'est refusé", () => {
    const resupply = placed();

    expect(
      resupply.markMounted({ at: LATER, author: PAUL }, { at: ARRIVED_AT, author: LOU }, false),
    ).toBe(false);
  });

  it("un « pour demain » se monte sans lancement", () => {
    const resupply = SiteResupply.draft({
      id: "rs3",
      siteId: "site_1",
      target: "tomorrow",
      at: PLACED_AT,
    });
    resupply.addLine(SiteResupplyLine.of({ sku: "CRO", label: "Croissant", quantity: 12 }));
    resupply.place({ at: PLACED_AT, author: LOU }, null, false);

    expect(resupply.markMounted({ at: ARRIVED_AT, author: PAUL }, null, false)).toBe(true);
  });
});
