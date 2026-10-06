import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ProductionDayClosedEvent } from "../../../../production/channels/delivery/index.js";
import { RecordingStaffNotifier } from "../../commands/__tests__/decision-doubles.js";
import { PlanArrestedBell } from "../../plan-arrested-bell.js";
import { LearnArrestedPlan } from "../learn-arrested-plan.handler.js";
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
const NOW = new Date("2026-10-06T16:00:05.000Z");

function setup(options: { vehicles?: readonly string[]; bins?: readonly string[] } = {}) {
  const orders = new FixedDeliveryOrders([
    orderFact("d1"),
    orderFact("d2"),
    orderFact("d3"),
    orderFact("p1", { delivery: false }),
    orderFact("x1", { cancelled: true }),
  ]);
  const days = new InMemoryDayReadiness();
  const notifier = new RecordingStaffNotifier();
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  const bell = new PlanArrestedBell(
    new FixedMeasuredVehicles(options.vehicles ?? ["v1"]),
    new FixedActiveBinTypes(options.bins ?? ["b1"]),
    notifier,
    afterCommit,
    work,
  );
  const locator = new RecordingDayStopsLocator();
  const handler = new LearnArrestedPlan(orders, days, bell, new FixedClock(NOW), locator);
  async function receive(orderIds: readonly string[], reannouncedAt: Date | null = null) {
    const fact = new ProductionDayClosedEvent(DAY, CLOSED, orderIds, reannouncedAt).durableFact();
    await handler.handle({ eventId: "e", type: fact.type, payload: fact.payload });
    await afterCommit.commit();
    await work.whenIdle();
  }
  return { orders, days, notifier, afterCommit, locator, receive };
}

describe("LearnArrestedPlan — la livraison apprend que le plan est arrêté", () => {
  it("range les seules livraisons actives du fait, et sonne une fois", async () => {
    const { days, notifier, receive } = setup();

    await receive(["d1", "d2", "p1", "x1"]);

    expect(days.rows.get(DAY)).toMatchObject({
      closedAt: CLOSED,
      deliveryOrderIds: ["d1", "d2"],
      createdAt: NOW,
    });
    expect(notifier.notified).toHaveLength(1);
    expect(notifier.notified[0]).toMatchObject({
      kind: "delivery.plan_arrested",
      subject: "Le plan du mercredi 7 octobre est arrêté : 2 livraisons à mettre en tournées",
      link: `/livraison/tournees?jour=${DAY}`,
      audience: "delivery_rounds:write",
    });
  });

  it("demande à situer les arrêts du jour, le rattrapage avant le jour J (CA0)", async () => {
    const { locator, receive } = setup();

    await receive(["d1"]);

    expect(locator.days).toEqual([DAY]);
  });

  it("borne la lecture aux commandes DU FAIT", async () => {
    const { orders, receive } = setup();

    await receive(["d1"]);

    expect(orders.asked).toEqual([["d1"]]);
  });

  it("un fait rejoué ne sonne pas une seconde fois", async () => {
    const { notifier, receive } = setup();
    await receive(["d1", "d2"]);

    await receive(["d1", "d2"]);

    expect(notifier.notified).toHaveLength(1);
  });

  it("une réannonce qui recouvre sonne les seules nouvelles", async () => {
    const { days, notifier, receive } = setup();
    await receive(["d1", "d2"]);

    await receive(["d2", "d1", "d3"], NOW);

    expect(days.rows.get(DAY)?.deliveryOrderIds).toEqual(["d1", "d2", "d3"]);
    expect(notifier.notified.map((notice) => notice.subject)).toEqual([
      "Le plan du mercredi 7 octobre est arrêté : 2 livraisons à mettre en tournées",
      "Le plan du mercredi 7 octobre est complété : 1 nouvelle livraison à placer",
    ]);
    expect(new Set(notifier.notified.map((notice) => notice.idempotencyKey)).size).toBe(2);
  });

  it("un plan sans livraison est rangé, sans sonner", async () => {
    const { days, notifier, receive } = setup();

    await receive(["p1"]);

    expect(days.rows.get(DAY)).toMatchObject({ closedAt: CLOSED, deliveryOrderIds: [] });
    expect(notifier.notified).toEqual([]);
  });

  it("sans véhicule mesuré (CA-D3), la cloche le dit — sans lever", async () => {
    const { days, notifier, receive } = setup({ vehicles: [] });

    await receive(["d1"]);

    expect(days.rows.get(DAY)?.deliveryOrderIds).toEqual(["d1"]);
    expect(notifier.notified[0]?.body).toContain("Impossible de proposer les tournées");
  });

  it("sans type de bac en service (CA-D3), la cloche le dit aussi", async () => {
    const { notifier, receive } = setup({ bins: [] });

    await receive(["d1"]);

    expect(notifier.notified[0]?.body).toContain("Livraison → Bacs");
  });

  it("une unité de travail qui échoue ne prévient personne", async () => {
    const { notifier, afterCommit, days } = setup();
    const handler = new LearnArrestedPlan(
      new FixedDeliveryOrders([orderFact("d1")]),
      days,
      new PlanArrestedBell(
        new FixedMeasuredVehicles(["v1"]),
        new FixedActiveBinTypes(["b1"]),
        notifier,
        afterCommit,
        new BackgroundWork(),
      ),
      new FixedClock(NOW),
      new RecordingDayStopsLocator(),
    );
    const fact = new ProductionDayClosedEvent(DAY, CLOSED, ["d1"]).durableFact();

    await handler.handle({ eventId: "e", type: fact.type, payload: fact.payload });
    afterCommit.discard();

    expect(notifier.notified).toEqual([]);
  });
});
