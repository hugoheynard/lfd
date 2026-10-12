import { OrderSettlementPayloadError } from "../../errors/order-settlement-payload.error.js";
import { OrderCancelledEvent } from "../order-cancelled.event.js";

/**
 * Le fait `order.cancelled` fait l'aller-retour pour chaque régime — dont
 * `account` (lot C5) et `paid` (lot C4), VALEURS écrites en base : elles ne
 * se renomment que par migration de données.
 */
describe("OrderCancelledEvent — aller-retour du fait durable", () => {
  it.each(["free", "due", "account", "paid"] as const)("régime %s", (regime) => {
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
      // `voided` (§2 D5) a été abandonné : jamais une valeur du fait.
      regime: "voided",
    };

    expect(() => OrderCancelledEvent.fromPayload(payload)).toThrow(OrderSettlementPayloadError);
  });

  it("le remboursement promis fait l'aller-retour (lot C4, C4.8)", () => {
    const event = new OrderCancelledEvent(
      "o1",
      "CMD-1",
      "usr_1",
      "staff_1",
      "motif",
      "paid",
      null,
      {
        announcedCents: 2_340,
      },
    );

    expect(OrderCancelledEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it("un fait d'avant C4, sans la clé `refund`, se lit `null`", () => {
    const { refund: _absent, ...before } = new OrderCancelledEvent(
      "o1",
      "CMD-1",
      "usr_1",
      "staff_1",
      "motif",
      "due",
      null,
    ).durableFact().payload;

    expect(OrderCancelledEvent.fromPayload(before).refund).toBeNull();
  });

  it.each([0, -5, "12", { announcedCents: 1.5 }])(
    "un remboursement hors forme (%p) est un fait hors forme",
    (refund) => {
      const payload = {
        ...new OrderCancelledEvent(
          "o1",
          "CMD-1",
          "usr_1",
          "staff_1",
          "motif",
          "paid",
          null,
        ).durableFact().payload,
        refund,
      };

      expect(() => OrderCancelledEvent.fromPayload(payload)).toThrow(OrderSettlementPayloadError);
    },
  );
});
