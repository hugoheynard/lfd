import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ProductionDayClosedEvent } from "../../../../production/channels/delivery/index.js";
import { RecordingStaffNotifier } from "../../commands/__tests__/decision-doubles.js";
import { PlanArrestedBell } from "../../plan-arrested-bell.js";
import { frozenResupply } from "../../__tests__/resupply-transfer-doubles.js";
import { attachmentOver, InMemoryInternalTransfers } from "../../__tests__/transfer-doubles.js";
import { LearnArrestedPlan } from "../learn-arrested-plan.handler.js";
import {
  FixedActiveBinTypes,
  FixedDeliveryOrders,
  FixedMeasuredVehicles,
  InMemoryDayReadiness,
  orderFact,
  RecordingDayStopsLocator,
} from "./day-readiness-doubles.js";

/*
 * L'arrêt du plan range au transfert de leur point les réassorts figés d'un
 * point servi par transfert (réassort, lot R3c) — depuis les `resupplyIds`
 * DU FAIT, un point sans commande compris ; jamais un point servi sur place.
 */

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-10-07";
const CLOSED = new Date(1_000);
const NOW = new Date(3_000);
const VV = { siteId: "site_vv", siteLabel: "Val Village", day: DAY } as const;

const VILLAGE = frozenResupply("res_vv", DAY);
const LABO = frozenResupply("res_labo", DAY, {
  siteId: "site_labo",
  siteLabel: "Le Labo",
  servedByTransfer: false,
});
const ELSEWHERE = frozenResupply("res_bourg", DAY, { siteId: "site_bourg", siteLabel: null });

function setup(transfers = new InMemoryInternalTransfers()) {
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  const bell = new PlanArrestedBell(
    new FixedMeasuredVehicles(["v1"]),
    new FixedActiveBinTypes(["b1"]),
    new RecordingStaffNotifier(),
    afterCommit,
    work,
  );
  const attachment = attachmentOver([{ orderId: "v1", ...VV }], transfers, undefined, [
    VILLAGE,
    LABO,
    ELSEWHERE,
  ]);
  const handler = new LearnArrestedPlan(
    new FixedDeliveryOrders([orderFact("v1", { delivery: false })]),
    new InMemoryDayReadiness(),
    bell,
    new FixedClock(NOW),
    new RecordingDayStopsLocator(),
    attachment,
  );
  return {
    transfers,
    close: async (orderIds: readonly string[], resupplyIds: readonly string[]) => {
      const fact = new ProductionDayClosedEvent(DAY, CLOSED, orderIds, null, resupplyIds);
      const { type, payload } = fact.durableFact();
      await handler.handle({ eventId: "e", type, payload });
      await afterCommit.commit();
      await work.whenIdle();
    },
  };
}

describe("LearnArrestedPlan — les réassorts au transfert (R3c)", () => {
  it("le réassort du Village rejoint le transfert de ses commandes", async () => {
    const { transfers, close } = setup();

    await close(["v1"], ["res_vv"]);

    const [transfer] = transfers.all();
    expect(transfers.all()).toHaveLength(1);
    expect(transfer?.orderIds).toEqual(["v1"]);
    expect(transfer?.resupplyIds).toEqual(["res_vv"]);
  });

  it("le réassort du Labo, servi sur place, n'ouvre aucun transfert", async () => {
    const { transfers, close } = setup();

    await close([], ["res_labo"]);

    expect(transfers.all()).toEqual([]);
  });

  it("un point sans commande ce jour-là reçoit quand même son transfert", async () => {
    const { transfers, close } = setup();

    await close([], ["res_vv"]);

    expect(transfers.all().map((transfer) => [transfer.siteLabel, transfer.resupplyIds])).toEqual([
      ["Val Village", ["res_vv"]],
    ]);
  });

  it("un nom de point inconnu à l'arrêt : le transfert garde l'identifiant du point", async () => {
    const { transfers, close } = setup();

    await close([], ["res_bourg"]);

    expect(transfers.all()[0]?.siteLabel).toBe("site_bourg");
  });

  it("seuls les réassorts DU FAIT entrent ; un rejeu n'ajoute rien", async () => {
    const { transfers, close } = setup();

    await close([], ["res_vv"]);
    await close([], ["res_vv"]);

    expect(transfers.all().flatMap((transfer) => transfer.resupplyIds)).toEqual(["res_vv"]);
    expect(transfers.all().flatMap((transfer) => transfer.orderIds)).toEqual([]);
  });

  it("un transfert déjà parti n'en reçoit plus : un autre s'ouvre", async () => {
    const transfers = new InMemoryInternalTransfers();
    const { close } = setup(transfers);
    await close(["v1"], []);
    const [first] = transfers.all();
    first?.depart(NOW, () => []);
    if (first !== undefined) {
      await transfers.save(first);
    }

    await close(["v1"], ["res_vv"]);

    expect(transfers.all().map((transfer) => transfer.resupplyIds)).toEqual([[], ["res_vv"]]);
  });
});
