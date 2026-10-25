import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../channels/commerce/day-resupplies.reader.js";
import {
  ResupplyAlreadyLaunchedError,
  ResupplyLaunchOnUnarrestedPlanError,
} from "../../errors/resupply-launch-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { NOTHING_PENDING, ProductionDay, type ResupplyLaunchGesture } from "../production-day.js";

/**
 * Le réassort « au plus tôt » lancé (R4a, `reassort-boutiques/plan-au-plus-tot.md`
 * §2) : un geste à part du retirage, rangé à part des réassorts du soir,
 * compté au total, qui survit à la réouverture. Dates recopiées et comparées
 * entre elles seulement — exception étroite du §5.
 */

const EVENING = new Date("2026-09-07T18:00:00.000Z");
const MORNING = new Date("2026-09-08T07:30:00.000Z");
const LATER = new Date("2026-09-08T08:00:00.000Z");
const NO_WITHDRAWAL = new Set<string>();

const GESTURE: ResupplyLaunchGesture = { at: MORNING, staffUserId: "s_max", name: "Max Martin" };

function order(orderId = "ord_1", quantity = 40): ProducibleOrder {
  return {
    orderId,
    reference: "ORD-0001",
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity }],
  };
}

function resupply(resupplyId: string, quantity: number, servedByTransfer = true): PlacedResupply {
  return {
    resupplyId,
    siteId: servedByTransfer ? "site_village" : "site_labo",
    siteLabel: servedByTransfer ? "Le Village" : "Le Labo",
    name: "Vitrine du midi",
    servedByTransfer,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity }],
  };
}

function opened(): ProductionDay {
  return ProductionDay.open(ServiceDay.of("2026-09-08"));
}

function closed(): ProductionDay {
  const day = opened();
  day.close([order()], NO_WITHDRAWAL, EVENING, null, [resupply("rs_evening", 12)]);
  return day;
}

function quantities(day: ProductionDay): readonly (readonly [string, number])[] {
  return day.counts.map((count) => [count.sku, count.quantity] as const);
}

describe("ProductionDay.launchResupply — sur une journée arrêtée", () => {
  it("range le réassort à part, avec son lancement, et l'ajoute au compte", () => {
    const day = closed();

    const opening = day.launchResupply(resupply("rs_asap", 8), GESTURE, NOTHING_PENDING);

    expect(opening).toBe(false);
    expect(day.resupplies.map((r) => r.resupplyId)).toEqual(["rs_evening"]);
    expect(day.launchedResupplies).toEqual([
      { ...resupply("rs_asap", 8), launched: { at: MORNING, by: "s_max" } },
    ]);
    expect(day.plannedResupplies.map((r) => r.resupplyId)).toEqual(["rs_evening", "rs_asap"]);
    expect(quantities(day)).toEqual([["VIE-001", 60]]);
    expect(day.closedAt).toEqual(EVENING);
  });

  it("refuse un second lancement du même réassort : il serait compté deux fois", () => {
    const day = closed();
    day.launchResupply(resupply("rs_asap", 8), GESTURE, NOTHING_PENDING);

    expect(() =>
      day.launchResupply(resupply("rs_asap", 8), { ...GESTURE, at: LATER }, NOTHING_PENDING),
    ).toThrow(ResupplyAlreadyLaunchedError);
    expect(quantities(day)).toEqual([["VIE-001", 60]]);
  });

  it("le retirage garde les lancés au compte refait", () => {
    const day = closed();
    day.launchResupply(resupply("rs_asap", 8), GESTURE, NOTHING_PENDING);

    day.retake([order(), order("ord_2", 5)], NO_WITHDRAWAL, LATER, "s_max", null);

    expect(quantities(day)).toEqual([["VIE-001", 65]]);
    expect(day.launchedResupplies).toHaveLength(1);
  });
});

describe("ProductionDay.launchResupply — la réouverture (S4)", () => {
  it("la réouverture vide le plan du soir mais GARDE les lancés", () => {
    const day = closed();
    day.launchResupply(resupply("rs_asap", 8), GESTURE, NOTHING_PENDING);

    day.reopen({ packingStarted: false, dispatchStarted: false }, LATER, "s_max");

    expect(day.resupplies).toEqual([]);
    expect(day.counts).toEqual([]);
    expect(day.launchedResupplies.map((r) => r.resupplyId)).toEqual(["rs_asap"]);
  });

  it("le ré-arrêt remet les lancés au compte, à côté de ce qu'il fige", () => {
    const day = closed();
    day.launchResupply(resupply("rs_asap", 8), GESTURE, NOTHING_PENDING);
    day.reopen({ packingStarted: false, dispatchStarted: false }, LATER, "s_max");

    day.close([order()], NO_WITHDRAWAL, LATER, null, []);

    expect(quantities(day)).toEqual([["VIE-001", 48]]);
    expect(day.launchedResupplies).toHaveLength(1);
  });

  it("une journée rouverte qui ne garde que des lancés s'arrête quand même", () => {
    const day = closed();
    day.launchResupply(resupply("rs_asap", 8), GESTURE, NOTHING_PENDING);
    day.reopen({ packingStarted: false, dispatchStarted: false }, LATER, "s_max");

    day.close([], NO_WITHDRAWAL, LATER, null, []);

    expect(day.isClosed).toBe(true);
    expect(quantities(day)).toEqual([["VIE-001", 8]]);
  });

  it("le déjà-lancé survit aussi au refus : relancé après réouverture, il est refusé", () => {
    const day = closed();
    day.launchResupply(resupply("rs_asap", 8), GESTURE, NOTHING_PENDING);
    day.reopen({ packingStarted: false, dispatchStarted: false }, LATER, "s_max");

    expect(() => day.launchResupply(resupply("rs_asap", 8), GESTURE, NOTHING_PENDING)).toThrow(
      ResupplyAlreadyLaunchedError,
    );
  });
});

describe("ProductionDay.launchResupply — une journée jamais arrêtée (Q5)", () => {
  it("l'ouvre ARRÊTÉE avec ce seul réassort, signée de qui lance, au colisage", () => {
    const day = opened();

    const opening = day.launchResupply(resupply("rs_asap", 8, false), GESTURE, NOTHING_PENDING);

    expect(opening).toBe(true);
    expect(day.isClosed).toBe(true);
    expect(day.closedAt).toEqual(MORNING);
    expect(day.closedBy).toEqual({ kind: "staff", staffUserId: "s_max", name: "Max Martin" });
    expect(day.packingOwner).toBe("packing");
    expect(day.orders).toEqual([]);
    expect(day.resupplies).toEqual([]);
    expect(quantities(day)).toEqual([["VIE-001", 8]]);
  });

  it("🔴 refuse de l'ouvrir s'il reste des commandes à figer : elles sortiraient du plan", () => {
    const day = opened();
    const pending = { ...NOTHING_PENDING, orders: [order()] };

    expect(() => day.launchResupply(resupply("rs_asap", 8), GESTURE, pending)).toThrow(
      ResupplyLaunchOnUnarrestedPlanError,
    );
    expect(day.isClosed).toBe(false);
    expect(day.launchedResupplies).toEqual([]);
  });

  it("refuse aussi s'il reste des réassorts du soir à figer", () => {
    const pending = { ...NOTHING_PENDING, resupplies: [resupply("rs_evening", 12)] };

    expect(() => opened().launchResupply(resupply("rs_asap", 8), GESTURE, pending)).toThrow(
      /Arrêtez d'abord le plan du jour/u,
    );
  });

  it("une commande retirée par l'annulation staff ne compte pas : la journée s'ouvre", () => {
    const pending = { ...NOTHING_PENDING, orders: [order()], withdrawn: new Set(["ord_1"]) };
    const day = opened();

    expect(day.launchResupply(resupply("rs_asap", 8), GESTURE, pending)).toBe(true);
  });
});

describe("ProductionDay — l'instantané des lancés", () => {
  it("va et revient ; un instantané d'avant R4a se relit sans lancé", () => {
    const day = closed();
    day.launchResupply(resupply("rs_asap", 8), GESTURE, NOTHING_PENDING);

    const again = ProductionDay.fromSnapshot(day.toSnapshot());
    const { launchedResupplies: _dropped, ...before } = day.toSnapshot();

    expect(again.toSnapshot()).toEqual(day.toSnapshot());
    expect(ProductionDay.fromSnapshot(before).launchedResupplies).toEqual([]);
  });
});
