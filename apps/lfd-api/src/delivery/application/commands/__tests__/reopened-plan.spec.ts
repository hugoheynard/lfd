import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { PlanHoldState } from "../../../../production/channels/delivery/index.js";
import { FixedStaffPermissionHolders } from "../../../../staff/directory/domain/__tests__/fixed-staff-permission-holders.js";
import { DeliveryPlanReopenedError } from "../../../domain/errors/delivery-plan-errors.js";
import { ScriptedPlanHold } from "../../__tests__/plan-hold-doubles.js";
import { resupplyContentsOver } from "../../__tests__/resupply-transfer-doubles.js";
import {
  FixedTransferContents,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
} from "../../__tests__/transfer-doubles.js";
import { DepartDeliveryRoundCommand } from "../depart-delivery-round.command.js";
import { DepartDeliveryRoundHandler } from "../depart-delivery-round.handler.js";
import { LoadDeliveryBinCommand } from "../load-delivery-bin.command.js";
import { LoadDeliveryBinHandler } from "../load-delivery-bin.handler.js";
import { FixedDoorstepSettings, RecordingDurable } from "./decision-doubles.js";
import {
  binOf,
  FixedDepartureHolds,
  InMemoryBins,
  InMemoryStopLoadings,
  RecordingDepartedStops,
  stopOf,
} from "./loading-doubles.js";
import {
  deliveryOn,
  FixedDeliveryOrders,
  InMemoryDeliveryRounds,
  roundWith,
} from "./round-doubles.js";

/**
 * **Charger et faire partir tiennent le plan, et seul un plan ROUVERT
 * refuse** (audit du réassort, 2026-11-02). Une journée jamais arrêtée se
 * charge et part comme avant.
 */

// Un jour comparé à rien, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);
const ORDERS = new FixedDeliveryOrders([deliveryOn("o_1", DAY)]);

/** Le stop de `o_1`, ses deux bacs chargés : la tournée peut partir. */
function loadedStop() {
  return stopOf("o_1", {
    loads: ["b_1", "b_2"].map((binId) => ({
      id: `l_${binId}`,
      binId,
      loadedAt: NOW,
      loadedBy: "staff_1",
      loadedVia: "scan" as const,
      createdAt: NOW,
    })),
  });
}

function loader(state: PlanHoldState) {
  const log: string[] = [];
  const loadings = new InMemoryStopLoadings(stopOf("o_1"));
  const handler = new LoadDeliveryBinHandler(
    new InMemoryBins(binOf("b_1", "o_1", "AAAAAA"), binOf("b_2", "o_1", "BBBBBB")),
    loadings,
    ORDERS,
    new InternalTransfersReaderOver(new InMemoryInternalTransfers()),
    new FixedIdGenerator("load"),
    new FixedClock(NOW),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
    new ScriptedPlanHold(state, log),
  );
  return { handler, loadings, log };
}

function departer(state: PlanHoldState) {
  const log: string[] = [];
  const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1"]));
  const durable = new RecordingDurable();
  const handler = new DepartDeliveryRoundHandler(
    rounds,
    new InMemoryStopLoadings(loadedStop()),
    new RecordingDepartedStops(),
    ORDERS,
    new FixedDepartureHolds(),
    new FixedDoorstepSettings(),
    new FixedClock(NOW),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
    durable,
    new FixedStaffPermissionHolders(),
    new InMemoryInternalTransfers(),
    new FixedTransferContents(),
    resupplyContentsOver(),
    new ScriptedPlanHold(state, log),
  );
  return { handler, rounds, durable, log };
}

describe("Charger un bac sous le plan tenu", () => {
  it.each(["arrested", "never_arrested"] as const)("plan %s : le bac est chargé", async (state) => {
    const { handler, loadings, log } = loader(state);

    await handler.execute(new LoadDeliveryBinCommand("r_1", { binId: "b_1" }, "staff_1"));

    expect(log).toEqual([`hold ${DAY}`]);
    expect(loadings.stored("o_1")?.loads).toHaveLength(1);
  });

  it("plan rouvert : refusé, rien de chargé", async () => {
    const { handler, loadings } = loader("reopened");

    await expect(
      handler.execute(new LoadDeliveryBinCommand("r_1", { binId: "b_1" }, "staff_1")),
    ).rejects.toThrow(DeliveryPlanReopenedError);
    expect(loadings.stored("o_1")?.loads ?? []).toEqual([]);
  });
});

describe("Faire partir une tournée sous le plan tenu", () => {
  it.each(["arrested", "never_arrested"] as const)("plan %s : la tournée part", async (state) => {
    const { handler, rounds, log } = departer(state);

    await handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 }));

    expect(log).toEqual([`hold ${DAY}`]);
    expect(rounds.stored("r_1")?.departedAt).toEqual(NOW);
  });

  it("plan rouvert : refusé avant toute écriture — ni départ, ni fait durable", async () => {
    const { handler, rounds, durable } = departer("reopened");

    await expect(
      handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(/a été rouvert.*Réarrêtez la journée/u);
    expect(rounds.stored("r_1")?.departedAt).toBeNull();
    expect(durable.facts).toEqual([]);
  });
});
