import {
  TransferReceptionDesk,
  type TransferReceptionRequest,
} from "../../../../delivery/channels/handover/index.js";
import { ReceiveTransferAtCounterCommand } from "../receive-transfer-at-counter.command.js";
import { ReceiveTransferAtCounterHandler } from "../receive-transfer-at-counter.handler.js";

/** Le comptoir demande, la livraison décide : un guichet qui note ce qu'on lui demande. */
class RecordingDesk extends TransferReceptionDesk {
  readonly asked: TransferReceptionRequest[] = [];

  receiveForOrder(request: TransferReceptionRequest): Promise<void> {
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
