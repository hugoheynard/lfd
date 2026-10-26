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
    const event = new OrderHandedOverEvent("ord_1", 1, "ORD-1", AT, "staff_a", "deposit");

    expect(OrderHandedOverEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it("une attestation a UNE clé par commande ; une réannonce, une clé par geste", () => {
    const first = new OrderHandedOverEvent("ord_1", 1, "ORD-1", AT, "a", "scan").durableFact();
    const again = new OrderHandedOverEvent(
      "ord_1",
      1,
      "ORD-1",
      AT,
      "a",
      "scan",
      LATER,
    ).durableFact();

    expect(first).toMatchObject({ type: HANDOVER_HANDED_OVER, key: "handover.handed_over:ord_1" });
    expect(again.key).toBe(`handover.handed_over:ord_1:reannounced:${LATER.toISOString()}`);
    // L'heure portée reste celle du VRAI retrait.
    expect(again.payload).toEqual(first.payload);
  });

  /** Plan E7 reliquat, §4 : la première annexe A l'oubliait — la seconde remise aurait été avalée. */
  it("un reliquat a sa clé ; le rang 1 garde celle d'avant", () => {
    const one = new OrderHandedOverEvent("ord_1", 1, "ORD-1", AT, "a", "scan").durableFact();
    const two = new OrderHandedOverEvent("ord_1", 2, "ORD-1", AT, "a", "scan").durableFact();
    const twoAgain = new OrderHandedOverEvent("ord_1", 2, "ORD-1", AT, "a", "scan", LATER);

    expect(one.key).toBe("handover.handed_over:ord_1");
    expect(two.key).toBe("handover.handed_over:ord_1:r2");
    expect(twoAgain.durableFact().key).toBe(
      `handover.handed_over:ord_1:r2:reannounced:${LATER.toISOString()}`,
    );
    expect(OrderHandedOverEvent.fromPayload(two.payload).rank).toBe(2);
  });

  it("relit un fait écrit avant le rang au rang 1", () => {
    const event = OrderHandedOverEvent.fromPayload({
      orderId: "o",
      reference: "R",
      handedOverAt: AT.toISOString(),
      handedOverBy: "a",
      via: "scan",
    });

    expect(event.rank).toBe(1);
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
      "rang nul",
      {
        orderId: "o",
        rank: 0,
        reference: "R",
        handedOverAt: AT.toISOString(),
        handedOverBy: "a",
        via: "scan",
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
