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

/**
 * Lot C6 (C6.6, S8) : le client peut annuler, et les faits déjà au journal
 * durable — écrits AVANT C6 — doivent se relire tels quels, comme l'équipe.
 */
describe("OrderCancelledEvent — l'auteur client (lot C6)", () => {
  /** Un `order.cancelled` sérialisé AVANT C6, tel que la boîte d'envoi le garde. */
  const BEFORE_C6 = {
    orderId: "o1",
    orderNumber: "CMD-1",
    placedByUserId: "usr_1",
    cancelledBy: "staff_1",
    reason: "Le client a appelé",
    regime: "due",
    voucher: null,
    refund: null,
  };

  it("S8 : un fait d'avant C6 se relit comme une annulation de l'équipe", () => {
    const event = OrderCancelledEvent.fromPayload(BEFORE_C6);

    expect(event.cancelledByKind).toBe("staff");
    expect(event.cancelledBy).toBe("staff_1");
    expect(event.cancelledByUserId).toBeNull();
    expect(event.reasonCode).toBeNull();
    expect(event.policy).toBeNull();
  });

  it("un client, sans motif : l'aller-retour garde l'auteur, le code et le délai", () => {
    const event = new OrderCancelledEvent(
      "o1",
      "CMD-1",
      "usr_1",
      null,
      null,
      "due",
      null,
      null,
      "customer",
      "usr_2",
      "wrong_date",
      { hoursBefore: 24 },
    );

    expect(OrderCancelledEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it("un invité fait l'aller-retour", () => {
    const event = new OrderCancelledEvent(
      "o1",
      "CMD-1",
      "usr_1",
      null,
      "Plus besoin",
      "free",
      null,
      null,
      "guest",
      "usr_1",
    );

    expect(OrderCancelledEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it.each([
    ["l'équipe sans fiche", { ...BEFORE_C6, cancelledBy: null }],
    ["l'équipe sans motif", { ...BEFORE_C6, reason: null }],
    ["un client sans fiche client", { ...BEFORE_C6, cancelledByKind: "customer" }],
    ["un auteur inconnu", { ...BEFORE_C6, cancelledByKind: "robot", cancelledByUserId: "u" }],
    ["un code hors liste", { ...BEFORE_C6, reasonCode: "caprice" }],
  ])("%s est un fait hors forme", (_label, payload) => {
    expect(() => OrderCancelledEvent.fromPayload(payload)).toThrow(OrderSettlementPayloadError);
  });
});
