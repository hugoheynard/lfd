import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import { DoorstepRoundStaleError } from "../../../domain/errors/delivery-doorstep-errors.js";
import { DriverRoundNotFoundError } from "../../../domain/errors/delivery-driver-errors.js";
import { StopNotATransferError } from "../../../domain/errors/internal-transfer-errors.js";
import type { InternalTransfer } from "../../../domain/entities/internal-transfer.js";
import { InMemoryInternalTransfers, plannedTransfer } from "../../__tests__/transfer-doubles.js";
import { DropTransferAtSiteCommand } from "../drop-transfer-at-site.command.js";
import { DropTransferAtSiteHandler } from "../drop-transfer-at-site.handler.js";
import { InMemoryDeliveryRounds } from "./round-doubles.js";

/*
 * « Remis au site » (plan du transfert interne, §6.3, lot T2) : le seul geste
 * d'un arrêt de transfert — il le clôt, ce qui laisse la tournée se terminer
 * (I9), et passe la garde au site.
 */

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const DEPARTED = new Date(1_000);
const NOW = new Date(5_000);
const PAUL = "staff_paul";

function departedRound(): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: DAY,
    vehicleId: "v_1",
    vehicleName: "Kangoo blanc",
    passage: 1,
    version: 3,
    departedAt: DEPARTED,
    driverStaffId: PAUL,
    createdAt: DEPARTED,
    updatedAt: DEPARTED,
    stops: [
      { kind: "order", id: "s_order", orderId: "o_1", position: 1, closedAt: null },
      { kind: "transfer", id: "s_transfer", transferId: "t_1", position: 2, closedAt: null },
    ],
  });
}

function departedTransfer(): InternalTransfer {
  const transfer = plannedTransfer("t_1", DAY, DEPARTED, ["o_v1"]);
  transfer.depart(DEPARTED, () => []);
  return transfer;
}

function scene(transfer = departedTransfer()) {
  const rounds = new InMemoryDeliveryRounds(departedRound());
  const transfers = new InMemoryInternalTransfers(transfer);
  const events = new RecordingPublisher();
  const handler = new DropTransferAtSiteHandler(
    rounds,
    transfers,
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { handler, rounds, transfers, events };
}

function drop(stopId = "s_transfer", version = 3, staff = PAUL): DropTransferAtSiteCommand {
  return new DropTransferAtSiteCommand(staff, "r_1", stopId, { version });
}

describe("DropTransferAtSiteHandler", () => {
  it("reçoit le transfert au site, clôt son arrêt, et le journalise", async () => {
    const { handler, rounds, transfers, events } = scene();

    await handler.execute(drop());

    const round = await rounds.load("r_1");
    expect(round?.hasClosed("s_transfer")).toBe(true);
    expect(transfers.all()[0]?.received).toEqual({ at: NOW, by: PAUL, reason: null });
    expect(events.factTypes()).toEqual(["internal_transfer.received"]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      via: "site_drop",
      manual: false,
    });
  });

  it("déjà réceptionné au comptoir : il ne fait que clore l'arrêt, sans seconde réception", async () => {
    const transfer = departedTransfer();
    transfer.receive({ at: DEPARTED, by: "staff_counter", reason: null });
    const { handler, rounds, transfers, events } = scene(transfer);

    await handler.execute(drop());

    expect((await rounds.load("r_1"))?.hasClosed("s_transfer")).toBe(true);
    expect(transfers.all()[0]?.received?.by).toBe("staff_counter");
    expect(transfers.saves).toEqual([]);
    expect(events.factTypes()).toEqual([]);
  });

  it("rejoué après une perte de réseau : « déjà fait », même avec l'ancienne version", async () => {
    const { handler, events } = scene();
    await handler.execute(drop());

    await handler.execute(drop("s_transfer", 3));

    expect(events.factTypes()).toEqual(["internal_transfer.received"]);
  });

  it("refuse un arrêt de commande : son geste est « Remis au client »", async () => {
    const { handler, transfers } = scene();

    await expect(handler.execute(drop("s_order"))).rejects.toThrow(StopNotATransferError);
    expect(transfers.all()[0]?.status).toBe("departed");
  });

  it("refuse une version périmée, et la tournée d'un autre livreur", async () => {
    const { handler } = scene();

    await expect(handler.execute(drop("s_transfer", 2))).rejects.toThrow(DoorstepRoundStaleError);
    await expect(handler.execute(drop("s_transfer", 3, "staff_other"))).rejects.toThrow(
      DriverRoundNotFoundError,
    );
  });
});
