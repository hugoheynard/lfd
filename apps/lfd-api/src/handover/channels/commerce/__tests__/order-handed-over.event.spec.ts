import {
  HANDOVER_HANDED_OVER,
  OrderHandedOverEvent,
  OrderHandedOverPayloadError,
} from "../order-handed-over.event.js";

// Des instants recopiés et comparés entre eux, jamais à une horloge.
const AT = new Date(60_000);
const LATER = new Date(120_000);

describe("le fait du retrait — `handover.handed_over`", () => {
  it("se relit à l'identique depuis son payload", () => {
    const event = new OrderHandedOverEvent("ord_1", "ORD-1", AT, "staff_a", "deposit");

    expect(OrderHandedOverEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it("une attestation a UNE clé par commande ; une réannonce, une clé par geste", () => {
    const first = new OrderHandedOverEvent("ord_1", "ORD-1", AT, "a", "scan").durableFact();
    const again = new OrderHandedOverEvent("ord_1", "ORD-1", AT, "a", "scan", LATER).durableFact();

    expect(first).toMatchObject({ type: HANDOVER_HANDED_OVER, key: "handover.handed_over:ord_1" });
    expect(again.key).toBe(`handover.handed_over:ord_1:reannounced:${LATER.toISOString()}`);
    // L'heure portée reste celle du VRAI retrait.
    expect(again.payload).toEqual(first.payload);
  });

  it("ne partage pas son type avec le fait homonyme du commerce", () => {
    expect(HANDOVER_HANDED_OVER).not.toBe("order.fulfilled");
  });

  it.each<[string, Readonly<Record<string, unknown>>]>([
    [
      "sans référence",
      { orderId: "o", handedOverAt: AT.toISOString(), handedOverBy: "a", via: "scan" },
    ],
    [
      "mode inconnu",
      {
        orderId: "o",
        reference: "R",
        handedOverAt: AT.toISOString(),
        handedOverBy: "a",
        via: "qr",
      },
    ],
    [
      "instant illisible",
      { orderId: "o", reference: "R", handedOverAt: "hier", handedOverBy: "a", via: "scan" },
    ],
  ])("refuse un payload hors contrat (%s)", (_case, payload) => {
    expect(() => OrderHandedOverEvent.fromPayload(payload)).toThrow(OrderHandedOverPayloadError);
  });
});
