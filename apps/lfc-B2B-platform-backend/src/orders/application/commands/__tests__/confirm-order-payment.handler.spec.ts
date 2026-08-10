import { OrderRepository } from "../../../domain/ports/order.repository.js";
import { ConfirmOrderPaymentCommand } from "../confirm-order-payment.command.js";
import { ConfirmOrderPaymentHandler } from "../confirm-order-payment.handler.js";

/** Repo doublé : enregistre lequel des deux marquages a été appelé, avec quel id. */
function recordingRepo(sink: { paid: string[]; failed: string[] }): OrderRepository {
  return {
    place: () => Promise.reject(new Error("non utilisé")),
    markPaid: (id) => {
      sink.paid.push(id);
      return Promise.resolve();
    },
    markPaymentFailed: (id) => {
      sink.failed.push(id);
      return Promise.resolve();
    },
    markHandedOver: () => Promise.reject(new Error("non utilisé")),
  };
}

describe("ConfirmOrderPaymentHandler", () => {
  it("route un succès vers markPaid(paymentIntentId)", async () => {
    const sink = { paid: [] as string[], failed: [] as string[] };
    const handler = new ConfirmOrderPaymentHandler(recordingRepo(sink));

    await handler.execute(new ConfirmOrderPaymentCommand("pi_1", "succeeded"));

    expect(sink.paid).toEqual(["pi_1"]);
    expect(sink.failed).toEqual([]);
  });

  it("route un échec vers markPaymentFailed(paymentIntentId)", async () => {
    const sink = { paid: [] as string[], failed: [] as string[] };
    const handler = new ConfirmOrderPaymentHandler(recordingRepo(sink));

    await handler.execute(new ConfirmOrderPaymentCommand("pi_2", "failed"));

    expect(sink.failed).toEqual(["pi_2"]);
    expect(sink.paid).toEqual([]);
  });
});
