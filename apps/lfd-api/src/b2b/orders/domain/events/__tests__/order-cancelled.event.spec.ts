import { OrderSettlementPayloadError } from "../../errors/order-settlement-payload.error.js";
import { OrderCancelledEvent } from "../order-cancelled.event.js";

/**
 * Le fait `order.cancelled` fait l'aller-retour pour chaque régime — dont
 * `account` (lot C5), VALEUR écrite en base : elle ne se renomme que par
 * migration de données.
 */
describe("OrderCancelledEvent — aller-retour du fait durable", () => {
  it.each(["free", "due", "account"] as const)("régime %s", (regime) => {
    const event = new OrderCancelledEvent("o1", "CMD-1", "usr_1", "staff_1", "motif", regime, null);

    expect(OrderCancelledEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it("un régime inconnu est un fait hors forme", () => {
    const payload = {
      ...new OrderCancelledEvent(
        "o1",
        "CMD-1",
        "usr_1",
        "staff_1",
        "motif",
        "due",
        null,
      ).durableFact().payload,
      regime: "paid",
    };

    expect(() => OrderCancelledEvent.fromPayload(payload)).toThrow(OrderSettlementPayloadError);
  });
});
