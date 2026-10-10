import { OrderSettlementPayloadError } from "../../errors/order-settlement-payload.error.js";
import {
  ORDER_PAID_AFTER_CANCELLATION,
  OrderPaidAfterCancellationEvent,
} from "../order-paid-after-cancellation.event.js";
import { ORDER_PAYMENT_FAILED, OrderPaymentFailedEvent } from "../order-payment-failed.event.js";

/**
 * Lot E4b (2026-10-10) : le refus et le remboursement dû sont relus dans la
 * boîte d'envoi. Un payload hors forme est une faute d'émetteur — le relire
 * avec une cause inventée enverrait le mauvais courriel.
 */
describe("OrderPaymentFailedEvent — le fait durable", () => {
  it("porte sa clé par commande ET par cause, et se relit à l'identique", () => {
    const fact = new OrderPaymentFailedEvent("ord_1", "day_closed").durableFact();

    expect(fact).toEqual({
      type: ORDER_PAYMENT_FAILED,
      key: "order.payment_failed:ord_1:day_closed",
      payload: { orderId: "ord_1", cause: "day_closed" },
    });
    expect(OrderPaymentFailedEvent.fromPayload(fact.payload)).toEqual(
      new OrderPaymentFailedEvent("ord_1", "day_closed"),
    );
  });

  it.each([
    [{ cause: "refused" }],
    [{ orderId: "", cause: "refused" }],
    [{ orderId: 42, cause: "refused" }],
    [{ orderId: "ord_1" }],
  ])("refuse un payload hors forme %o", (payload) => {
    expect(() => OrderPaymentFailedEvent.fromPayload(payload)).toThrow(OrderSettlementPayloadError);
  });

  it("refuse une cause hors de PaymentFailureCause", () => {
    expect(() => OrderPaymentFailedEvent.fromPayload({ orderId: "ord_1", cause: "lost" })).toThrow(
      OrderSettlementPayloadError,
    );
  });
});

describe("OrderPaidAfterCancellationEvent — le fait durable", () => {
  it("porte sa clé par commande, et se relit à l'identique", () => {
    const fact = new OrderPaidAfterCancellationEvent("ord_2").durableFact();

    expect(fact).toEqual({
      type: ORDER_PAID_AFTER_CANCELLATION,
      key: "order.paid_after_cancellation:ord_2",
      payload: { orderId: "ord_2" },
    });
    expect(OrderPaidAfterCancellationEvent.fromPayload(fact.payload)).toEqual(
      new OrderPaidAfterCancellationEvent("ord_2"),
    );
  });

  it.each([[{}], [{ orderId: "" }], [{ orderId: null }]])(
    "refuse un payload hors forme %o",
    (payload) => {
      expect(() => OrderPaidAfterCancellationEvent.fromPayload(payload)).toThrow(
        OrderSettlementPayloadError,
      );
    },
  );
});
