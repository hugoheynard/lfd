import {
  PackingShortfallClearedEvent,
  PackingShortfallPayloadError,
  PackingShortfallReportedEvent,
} from "../index.js";

// Instants comparés entre eux, jamais à l'horloge.
const AT = new Date(1_000);

describe("packing.shortfall_reported — le contrat relu par le commerce", () => {
  const event = new PackingShortfallReportedEvent("ord_1", 1, "ORD-0001", AT, "s1", [
    { sku: "CRO", due: 4, packed: 0 },
  ]);

  it("se relit à l'identique depuis sa charge", () => {
    expect(PackingShortfallReportedEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  /** Plan E7 reliquat, choix 15 : la clé porte l'instant, le rang va dans la charge. */
  it("porte le rang dans la charge, pas dans la clé", () => {
    const two = new PackingShortfallReportedEvent("ord_1", 2, "ORD-0001", AT, "s1", [
      { sku: "CRO", due: 4, packed: 0 },
    ]).durableFact();

    expect(two.key).toBe(event.durableFact().key);
    expect(PackingShortfallReportedEvent.fromPayload(two.payload).rank).toBe(2);
  });

  it("relit un fait écrit avant le rang au rang 1", () => {
    const { rank: _absent, ...older } = event.durableFact().payload;

    expect(PackingShortfallReportedEvent.fromPayload(older).rank).toBe(1);
  });

  it.each([
    ["un rang nul", { rank: 0 }],
    ["sans lignes", { lines: [] }],
    ["une quantité négative", { lines: [{ sku: "CRO", due: 4, packed: -1 }] }],
    ["un instant illisible", { reportedAt: "hier" }],
    ["sans référence", { reference: "" }],
  ])("refuse une charge %s", (_case, broken) => {
    const payload = { ...event.durableFact().payload, ...broken };

    expect(() => PackingShortfallReportedEvent.fromPayload(payload)).toThrow(
      PackingShortfallPayloadError,
    );
  });
});

describe("packing.shortfall_cleared — le contrat relu par le commerce", () => {
  const event = new PackingShortfallClearedEvent("ord_1", 1, "ORD-0001", AT);

  it("se relit à l'identique depuis sa charge", () => {
    expect(PackingShortfallClearedEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it("porte le rang dans la charge, pas dans la clé ; un fait d'avant se lit au rang 1", () => {
    const two = new PackingShortfallClearedEvent("ord_1", 2, "ORD-0001", AT).durableFact();
    const { rank: _absent, ...older } = event.durableFact().payload;

    expect(two.key).toBe(event.durableFact().key);
    expect(PackingShortfallClearedEvent.fromPayload(two.payload).rank).toBe(2);
    expect(PackingShortfallClearedEvent.fromPayload(older).rank).toBe(1);
  });

  it("refuse une charge sans instant", () => {
    const payload = { ...event.durableFact().payload, clearedAt: null };

    expect(() => PackingShortfallClearedEvent.fromPayload(payload)).toThrow(
      PackingShortfallPayloadError,
    );
  });
});
