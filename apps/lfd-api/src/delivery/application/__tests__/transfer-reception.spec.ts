import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import {
  OrderNotInTransferError,
  TransferAlreadyReceivedError,
  TransferReceptionReasonRequiredError,
} from "../../domain/errors/internal-transfer-errors.js";
import { TransferReception } from "../transfer-reception.js";
import {
  FixedTransferBinCounts,
  InMemoryInternalTransfers,
  plannedTransfer,
} from "./transfer-doubles.js";

/** « Réceptionner » au comptoir du site (plan du transfert interne, §6.3, Q-T6, lot T2). */

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const NOW = new Date(60_000);

function scene(departed: boolean) {
  const transfer = plannedTransfer("t_1", DAY, AT, ["o_1"]);
  if (departed) {
    transfer.depart(AT, () => []);
  }
  const transfers = new InMemoryInternalTransfers(transfer);
  const events = new RecordingPublisher();
  const desk = new TransferReception(
    transfers,
    new FixedTransferBinCounts(new Map([["t_1", 3]])),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { desk, transfers, events };
}

describe("TransferReception", () => {
  it("reçoit un transfert parti, au comptoir, et le journalise", async () => {
    const { desk, transfers, events } = scene(true);

    await desk.receiveForOrder({ orderId: "o_1", staffUserId: "staff_c", reason: null });

    expect(transfers.all()[0]?.received).toEqual({ at: NOW, by: "staff_c", reason: null });
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "internal_transfer.received",
      // Lot T3 : la réception compte les bacs du transfert.
      payload: { via: "counter", manual: false, reason: null, bins: 3 },
    });
  });

  it("une réception MANUELLE (sans tournée) exige son motif, et le journal le dit", async () => {
    const { desk, events } = scene(false);

    await expect(
      desk.receiveForOrder({ orderId: "o_1", staffUserId: "staff_c", reason: null }),
    ).rejects.toThrow(TransferReceptionReasonRequiredError);
    await desk.receiveForOrder({
      orderId: "o_1",
      staffUserId: "staff_c",
      reason: "Venu par le personnel",
    });

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      manual: true,
      reason: "Venu par le personnel",
    });
  });

  it("une réception, une seule : le second comptoir est refusé", async () => {
    const { desk } = scene(true);
    await desk.receiveForOrder({ orderId: "o_1", staffUserId: "staff_c", reason: null });

    await expect(
      desk.receiveForOrder({ orderId: "o_1", staffUserId: "staff_d", reason: null }),
    ).rejects.toThrow(TransferAlreadyReceivedError);
  });

  it("une commande qu'aucun transfert ne porte : 404 nommé", async () => {
    const { desk } = scene(true);

    await expect(
      desk.receiveForOrder({ orderId: "o_x", staffUserId: "staff_c", reason: null }),
    ).rejects.toThrow(OrderNotInTransferError);
  });
});
