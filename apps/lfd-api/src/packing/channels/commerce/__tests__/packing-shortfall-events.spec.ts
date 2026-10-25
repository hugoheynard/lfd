import {
  PackingShortfallClearedEvent,
  PackingShortfallPayloadError,
  PackingShortfallReportedEvent,
} from "../index.js";

// Instants comparés entre eux, jamais à l'horloge.
const AT = new Date(1_000);

describe("packing.shortfall_reported — le contrat relu par le commerce", () => {
  const event = new PackingShortfallReportedEvent("ord_1", "ORD-0001", AT, "s1", [
    { sku: "CRO", due: 4, packed: 0 },
  ]);

  it("se relit à l'identique depuis sa charge", () => {
    expect(PackingShortfallReportedEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it.each([
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
  const event = new PackingShortfallClearedEvent("ord_1", "ORD-0001", AT);

  it("se relit à l'identique depuis sa charge", () => {
    expect(PackingShortfallClearedEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it("refuse une charge sans instant", () => {
    const payload = { ...event.durableFact().payload, clearedAt: null };

    expect(() => PackingShortfallClearedEvent.fromPayload(payload)).toThrow(
      PackingShortfallPayloadError,
    );
  });
});
