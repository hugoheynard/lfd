import { FixedStaffPermissionHolders } from "../../../../staff/directory/domain/__tests__/fixed-staff-permission-holders.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import { DeliveryRoundNotReadyError } from "../../../domain/errors/delivery-loading-errors.js";
import {
  FixedTransferContents,
  InMemoryInternalTransfers,
  plannedTransfer,
} from "../../__tests__/transfer-doubles.js";
import { DepartDeliveryRoundCommand } from "../depart-delivery-round.command.js";
import { DepartDeliveryRoundHandler } from "../depart-delivery-round.handler.js";
import { FixedDoorstepSettings, RecordingDurable } from "./decision-doubles.js";
import {
  FixedDepartureHolds,
  InMemoryStopLoadings,
  RecordingDepartedStops,
  stopOf,
} from "./loading-doubles.js";
import { deliveryOn, FixedDeliveryOrders, InMemoryDeliveryRounds } from "./round-doubles.js";

/*
 * « Partir » avec un arrêt de transfert interne (plan du transfert interne,
 * §5, lot T1) : le transfert part avec la tournée et fige son manifeste ; ses
 * commandes — des retraits — ne sont ni dans les feuilles, ni dans le fait de
 * départ.
 */

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);

function roundWithTransfer(): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: DAY,
    vehicleId: "v_1",
    vehicleName: "Kangoo blanc",
    passage: 1,
    version: 1,
    departedAt: null,
    driverStaffId: null,
    createdAt: NOW,
    updatedAt: NOW,
    stops: [
      { kind: "order", id: "r_1_s1", orderId: "o_1", position: 1, closedAt: null },
      { kind: "transfer", id: "r_1_st", transferId: "t_1", position: 2, closedAt: null },
    ],
  });
}

function loadedBin(binId: string) {
  return {
    id: `l_${binId}`,
    binId,
    loadedAt: NOW,
    loadedBy: "staff_1",
    loadedVia: "scan" as const,
    createdAt: NOW,
  };
}

function setup(transferLoaded: boolean) {
  const transfers = new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, NOW, ["o_v1"]));
  const durable = new RecordingDurable();
  const departed = new RecordingDepartedStops();
  const handler = new DepartDeliveryRoundHandler(
    new InMemoryDeliveryRounds(roundWithTransfer()),
    new InMemoryStopLoadings(
      stopOf("o_1", {
        bins: [{ id: "b_1", code: "AAAAAA", voided: false, partnerOrderId: null }],
        loads: [loadedBin("b_1")],
      }),
      stopOf("o_v1", {
        stopId: "r_1_st",
        subject: { kind: "transfer", transferId: "t_1" },
        bins: [{ id: "b_v", code: "VVVVVV", voided: false, partnerOrderId: null }],
        loads: transferLoaded ? [loadedBin("b_v")] : [],
      }),
    ),
    departed,
    new FixedDeliveryOrders([deliveryOn("o_1", DAY)]),
    new FixedDepartureHolds(),
    new FixedDoorstepSettings(),
    new FixedClock(NOW),
    new RecordingPublisher(),
    new DirectUnitOfWork(),
    durable,
    new FixedStaffPermissionHolders(),
    transfers,
    new FixedTransferContents(new Map([["o_v1", [{ sku: "PAIN", name: "Pain", quantity: 4 }]]])),
  );
  return { handler, transfers, durable, departed };
}

describe("Partir avec un arrêt de transfert (lot T1)", () => {
  it("fait partir le transfert et fige son manifeste ; le fait de départ ne porte que les livraisons", async () => {
    const { handler, transfers, durable, departed } = setup(true);

    await handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 }));

    const [transfer] = transfers.all();
    expect(transfer?.departedAt).toEqual(NOW);
    expect(transfer?.toSnapshot().manifest).toEqual([
      { itemId: "t_1_i1", sku: "PAIN", productName: "Pain", quantity: 4 },
    ]);
    expect(durable.facts.map((fact) => fact.payload["orderIds"])).toEqual([["o_1"]]);
    expect(departed.recorded.map((stop) => stop.stopId)).toEqual(["r_1_s1"]);
  });

  it("refuse de partir tant que les bacs du transfert ne sont pas chargés, en nommant le site", async () => {
    const { handler, transfers } = setup(false);

    const refusal = handler.execute(new DepartDeliveryRoundCommand("r_1", { version: 1 }));

    await expect(refusal).rejects.toThrow(DeliveryRoundNotReadyError);
    await expect(refusal).rejects.toThrow(/→ Val Village/u);
    expect(transfers.all()[0]?.departedAt).toBeNull();
  });
});
