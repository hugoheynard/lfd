import {
  PackingOrderPackedEvent,
  PackingOrderPackedPayloadError,
} from "../packing-order-packed.event.js";

/**
 * Le fait « commande colisée », déclaré par le colisage : ses clés, et sa
 * charge relue. Instants recopiés, jamais comparés à l'horloge.
 */
const AT = new Date("2026-09-13T05:10:00.000Z");

describe("PackingOrderPackedEvent", () => {
  const LATER = new Date(AT.getTime() + 60_000);

  it("au rang 1, la clé d'avant ; une réannonce, une clé par geste", () => {
    const one = new PackingOrderPackedEvent("ord_1", 1, "ORD-0001", AT, "s1").durableFact();
    const again = new PackingOrderPackedEvent("ord_1", 1, "ORD-0001", AT, "s1", LATER);
    expect(one.key).toBe("packing.order_packed:ord_1");
    expect(again.durableFact().key).toBe(
      `packing.order_packed:ord_1:reannounced:${LATER.toISOString()}`,
    );
  });

  /** Plan E7 reliquat, §4 : la première annexe A oubliait cette clé. */
  it("deux rangs, deux clés", () => {
    const two = new PackingOrderPackedEvent("ord_1", 2, "ORD-0001", AT, "s1");
    expect(two.durableFact().key).toBe("packing.order_packed:ord_1:r2");
    expect(PackingOrderPackedEvent.fromPayload(two.durableFact().payload)).toEqual(two);
  });

  it("relit un fait écrit sans rang au rang 1, refuse un rang nul", () => {
    const { rank: _absent, ...older } = new PackingOrderPackedEvent(
      "ord_1",
      1,
      "ORD-0001",
      AT,
      "s1",
    ).durableFact().payload;
    expect(PackingOrderPackedEvent.fromPayload(older).rank).toBe(1);
    expect(() => PackingOrderPackedEvent.fromPayload({ ...older, rank: 0 })).toThrow(
      PackingOrderPackedPayloadError,
    );
  });
});
