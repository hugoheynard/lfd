import {
  type TransferIdReceptionRequest,
  TransferReceptionDesk,
  type TransferReceptionRequest,
} from "../../../../delivery/channels/handover/index.js";
import { ReceiveTransferAtCounterCommand } from "../receive-transfer-at-counter.command.js";
import { ReceiveTransferAtCounterHandler } from "../receive-transfer-at-counter.handler.js";
import { ReceiveTransferByIdAtCounterCommand } from "../receive-transfer-by-id-at-counter.command.js";
import { ReceiveTransferByIdAtCounterHandler } from "../receive-transfer-by-id-at-counter.handler.js";

/** Le comptoir demande, la livraison décide : un guichet qui note ce qu'on lui demande. */
class RecordingDesk extends TransferReceptionDesk {
  readonly asked: (TransferReceptionRequest | TransferIdReceptionRequest)[] = [];

  receiveForOrder(request: TransferReceptionRequest): Promise<void> {
    this.asked.push(request);
    return Promise.resolve();
  }

  receiveTransfer(request: TransferIdReceptionRequest): Promise<void> {
    this.asked.push(request);
    return Promise.resolve();
  }
}

describe("ReceiveTransferAtCounterHandler (lot T2, Q-T6)", () => {
  it("demande à la livraison de recevoir le transfert de la commande, avec l'auteur et le motif", async () => {
    const desk = new RecordingDesk();

    await new ReceiveTransferAtCounterHandler(desk).execute(
      new ReceiveTransferAtCounterCommand("o_1", "staff_c", "Venu par le personnel"),
    );

    expect(desk.asked).toEqual([
      { orderId: "o_1", staffUserId: "staff_c", reason: "Venu par le personnel" },
    ]);
  });
});

describe("ReceiveTransferByIdAtCounterHandler (R3c, R3e)", () => {
  it("demande à la livraison de recevoir le transfert désigné par lui-même", async () => {
    const desk = new RecordingDesk();

    await new ReceiveTransferByIdAtCounterHandler(desk).execute(
      new ReceiveTransferByIdAtCounterCommand("t_1", "staff_c", null),
    );

    expect(desk.asked).toEqual([{ transferId: "t_1", staffUserId: "staff_c", reason: null }]);
  });
});
