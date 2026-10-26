import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ProductionDayClosedEvent,
  ProductionDayRetakenEvent,
  ShipmentRef,
} from "../../../../production/channels/delivery/index.js";
import { RecordingStaffNotifier } from "../../commands/__tests__/decision-doubles.js";
import { PlanArrestedBell } from "../../plan-arrested-bell.js";
import {
  attachmentOver,
  InMemoryInternalTransfers,
  RecordingTransferPlacer,
} from "../../__tests__/transfer-doubles.js";
import { LearnArrestedPlan } from "../learn-arrested-plan.handler.js";
import { LearnRetakenPlan } from "../learn-retaken-plan.handler.js";
import {
  FixedActiveBinTypes,
  FixedDeliveryOrders,
  FixedMeasuredVehicles,
  InMemoryDayReadiness,
  orderFact,
  RecordingDayStopsLocator,
  firsts,
} from "./day-readiness-doubles.js";

/*
 * L'arrêt du plan et le retirage rangent les retraits des sites servis par
 * transfert dans leur transfert (plan du transfert interne, lot T1) ; le
 * retirage d'un jour déjà composé demande de placer ce qui est neuf.
 */

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-10-07";
const CLOSED = new Date(1_000);
const RETAKEN = new Date(2_000);
const NOW = new Date(3_000);
const VV = { siteId: "site_vv", siteLabel: "Val Village", day: DAY } as const;

function setup() {
  const orders = new FixedDeliveryOrders([orderFact("d1"), orderFact("v1", { delivery: false })]);
  const days = new InMemoryDayReadiness();
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  const bell = new PlanArrestedBell(
    new FixedMeasuredVehicles(["v1"]),
    new FixedActiveBinTypes(["b1"]),
    new RecordingStaffNotifier(),
    afterCommit,
    work,
  );
  const transfers = new InMemoryInternalTransfers();
  const attachment = attachmentOver(
    [
      { orderId: "v1", ...VV },
      { orderId: "v2", ...VV },
    ],
    transfers,
  );
  const placer = new RecordingTransferPlacer();
  const clock = new FixedClock(NOW);
  const locator = new RecordingDayStopsLocator();
  const closures = new LearnArrestedPlan(orders, days, bell, clock, locator, attachment);
  const retakes = new LearnRetakenPlan(orders, days, bell, clock, locator, attachment, placer);
  async function deliver(
    handler: LearnArrestedPlan | LearnRetakenPlan,
    fact: { readonly type: string; readonly payload: Readonly<Record<string, unknown>> },
  ) {
    await handler.handle({ eventId: "e", type: fact.type, payload: fact.payload });
    await afterCommit.commit();
    await work.whenIdle();
  }
  return {
    transfers,
    placer,
    days,
    close: (orderIds: readonly string[]) =>
      deliver(closures, new ProductionDayClosedEvent(DAY, CLOSED, orderIds).durableFact()),
    retake: (orderIds: readonly string[]) =>
      deliver(
        retakes,
        new ProductionDayRetakenEvent(
          DAY,
          RETAKEN,
          orderIds.length,
          orderIds.map((orderId) => ShipmentRef.firstOf(orderId)),
        ).durableFact(),
      ),
  };
}

describe("l'arrêt du plan et le retirage rangent les transferts (lot T1)", () => {
  it("à la clôture : le retrait du village rejoint son transfert ; la livraison reste au jour", async () => {
    const { transfers, days, close } = setup();

    await close(["d1", "v1"]);

    expect(transfers.all().map((t) => t.orderIds)).toEqual([["v1"]]);
    expect(days.rows.get(DAY)?.shipments).toEqual(firsts("d1"));
  });

  it("au retirage d'un jour composé : range, puis demande de placer", async () => {
    const { transfers, placer, close, retake } = setup();
    await close(["d1"]);

    await retake(["v2"]);

    expect(transfers.all().map((t) => t.orderIds)).toEqual([["v2"]]);
    expect(placer.soon).toEqual([DAY]);
  });

  it("au retirage AVANT la clôture : range, et laisse la composition placer", async () => {
    const { transfers, placer, retake } = setup();

    await retake(["v1"]);

    expect(transfers.all()).toHaveLength(1);
    expect(placer.soon).toEqual([]);
  });
});
