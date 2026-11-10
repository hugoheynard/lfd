import { OrderRevisedEvent, OrderRevisedPayloadError } from "../order-revised.event.js";

const event = (origin: "direct" | "change_request") =>
  new OrderRevisedEvent(
    "ord_1",
    "ORD-1",
    "usr_1",
    2,
    { kind: "staff", staffId: "stf_1" },
    ["lines"],
    1_000,
    1_200,
    origin,
  );

describe("le fait « commande modifiée » et son origine", () => {
  it.each(["direct", "change_request"] as const)("relit l'origine %s qu'il a écrite", (origin) => {
    expect(OrderRevisedEvent.fromPayload(event(origin).durableFact().payload)).toEqual(
      event(origin),
    );
  });

  it("lit `direct` un fait écrit avant le champ", () => {
    const { origin: _absent, ...older } = event("change_request").durableFact().payload;

    expect(OrderRevisedEvent.fromPayload(older).origin).toBe("direct");
  });

  it("refuse une origine inconnue plutôt que de la deviner", () => {
    const payload = { ...event("direct").durableFact().payload, origin: "elsewhere" };

    expect(() => OrderRevisedEvent.fromPayload(payload)).toThrow(OrderRevisedPayloadError);
  });
});
