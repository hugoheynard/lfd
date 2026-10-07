import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ProductionDayClosedEvent,
  ProductionDayRetakenEvent,
} from "../../../../production/channels/delivery/index.js";
import { RecordingStaffNotifier } from "../../commands/__tests__/decision-doubles.js";
import { PlanArrestedBell } from "../../plan-arrested-bell.js";
import { LearnArrestedPlan } from "../learn-arrested-plan.handler.js";
import { LearnRetakenPlan } from "../learn-retaken-plan.handler.js";
import {
  FixedActiveBinTypes,
  FixedDeliveryOrders,
  FixedMeasuredVehicles,
  InMemoryDayReadiness,
  RecordingDayStopsLocator,
  orderFact,
} from "./day-readiness-doubles.js";

// Des instants comparés entre eux seulement : le handler ne lit l'horloge que
// pour dater la ligne.
const DAY = "2026-10-07";
const CLOSED = new Date("2026-10-06T16:00:00.000Z");
const RETAKEN = new Date("2026-10-06T18:00:00.000Z");
const NOW = new Date("2026-10-06T18:00:05.000Z");

function setup() {
  const orders = new FixedDeliveryOrders([
    orderFact("d1"),
    orderFact("d2"),
    orderFact("r1"),
    orderFact("r2"),
    orderFact("p1", { delivery: false }),
    orderFact("x1", { cancelled: true }),
  ]);
  const days = new InMemoryDayReadiness();
  const notifier = new RecordingStaffNotifier();
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  const bell = new PlanArrestedBell(
    new FixedMeasuredVehicles(["v1"]),
    new FixedActiveBinTypes(["b1"]),
    notifier,
    afterCommit,
    work,
  );
  const clock = new FixedClock(NOW);
  const locator = new RecordingDayStopsLocator();
  const closures = new LearnArrestedPlan(orders, days, bell, clock, locator);
  const retakes = new LearnRetakenPlan(orders, days, bell, clock, locator);
  async function deliver(
    handler: LearnArrestedPlan | LearnRetakenPlan,
    fact: { readonly type: string; readonly payload: Readonly<Record<string, unknown>> },
  ) {
    await handler.handle({ eventId: "e", type: fact.type, payload: fact.payload });
    await afterCommit.commit();
    await work.whenIdle();
  }
  return {
    locator,
    orders,
    days,
    notifier,
    close: (orderIds: readonly string[]) =>
      deliver(closures, new ProductionDayClosedEvent(DAY, CLOSED, orderIds).durableFact()),
    retake: (orderIds: readonly string[]) =>
      deliver(
        retakes,
        new ProductionDayRetakenEvent(DAY, RETAKEN, orderIds.length, orderIds).durableFact(),
      ),
    deliverRaw: (payload: Readonly<Record<string, unknown>>) =>
      deliver(retakes, { type: "production.day_retaken", payload }),
  };
}

const subjects = (notifier: RecordingStaffNotifier) => notifier.notified.map((n) => n.subject);

describe("LearnRetakenPlan — un retirage complète le plan arrêté", () => {
  it("fait l'union des livraisons absorbées et sonne le delta", async () => {
    const { days, notifier, close, retake } = setup();
    await close(["d1", "d2"]);

    await retake(["r1", "r2", "p1", "x1"]);

    expect(days.rows.get(DAY)).toMatchObject({
      closedAt: CLOSED,
      deliveryOrderIds: ["d1", "d2", "r1", "r2"],
    });
    expect(subjects(notifier)).toEqual([
      "Le plan du mercredi 7 octobre est arrêté : 2 livraisons à mettre en tournées",
      "Le plan du mercredi 7 octobre est complété : 2 nouvelles livraisons à placer",
    ]);
    expect(new Set(notifier.notified.map((n) => n.idempotencyKey)).size).toBe(2);
  });

  it("demande à situer les arrêts du jour à chaque retirage (CA0)", async () => {
    const { locator, close, retake } = setup();

    await close(["d1"]);
    await retake(["r1"]);

    // L'arrêt prépare (situe PUIS compose) ; le retirage situe seulement :
    // ses commandes tardives passent par la place suggérée (2026-10-07).
    expect(locator.days).toEqual([DAY]);
    expect(locator.located).toEqual([DAY]);
  });

  it("borne la lecture aux commandes absorbées DU FAIT", async () => {
    const { orders, retake } = setup();

    await retake(["r1"]);

    expect(orders.asked).toEqual([["r1"]]);
  });

  it("un retirage rejoué ne sonne pas une seconde fois", async () => {
    const { notifier, close, retake } = setup();
    await close(["d1"]);
    await retake(["r1"]);

    await retake(["r1"]);

    expect(notifier.notified).toHaveLength(2);
  });

  it("un retirage sans livraison nouvelle ne sonne pas", async () => {
    const { notifier, close, retake } = setup();
    await close(["d1"]);

    await retake(["p1", "x1"]);

    expect(notifier.notified).toHaveLength(1);
  });

  it("avant la clôture, il range sans arrêter ni sonner ; la clôture annonce le total", async () => {
    const { days, notifier, close, retake } = setup();

    await retake(["r1", "r2"]);

    expect(days.rows.get(DAY)).toMatchObject({ closedAt: null, deliveryOrderIds: ["r1", "r2"] });
    expect(notifier.notified).toEqual([]);

    await close(["d1", "d2"]);

    expect(days.rows.get(DAY)?.closedAt).toEqual(CLOSED);
    expect(subjects(notifier)).toEqual([
      "Le plan du mercredi 7 octobre est arrêté : 4 livraisons à mettre en tournées",
    ]);
  });

  /** Un fait écrit avant CA6b n'a que le compte : rien à ranger, rien à lever. */
  it("un ancien fait sans liste ne fait rien et ne lève pas", async () => {
    const { days, orders, notifier, close, deliverRaw } = setup();
    await close(["d1"]);

    await deliverRaw({ serviceDay: DAY, retakenAt: RETAKEN.toISOString(), absorbed: 2 });

    expect(days.rows.get(DAY)?.deliveryOrderIds).toEqual(["d1"]);
    expect(orders.asked).toEqual([["d1"]]);
    expect(notifier.notified).toHaveLength(1);
  });
});
