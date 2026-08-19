import type { ShopifyProductPayload } from "../projection.js";
import { CorruptedSnapshotError, payloadColumn, readPayloadColumn } from "../snapshot-payload.js";

const PAYLOAD: ShopifyProductPayload = {
  title: "Croissant",
  handle: "croissant",
  status: "DRAFT",
  variants: [
    {
      sku: "PATI-CROISSANT",
      title: "Nature",
      options: { taille: "unité" },
      price: "1.30",
    },
    {
      sku: "PATI-CROISSANT-X6",
      title: "Par 6",
      options: {},
      price: null,
    },
  ],
};

describe("snapshot payload (aller-retour jsonb)", () => {
  it("relit à l’identique ce qu’il a écrit", () => {
    const roundTripped = readPayloadColumn(payloadColumn(PAYLOAD));
    expect(roundTripped).toEqual(PAYLOAD);
  });

  it("préserve un prix null (déclinaison non tarifée)", () => {
    const roundTripped = readPayloadColumn(payloadColumn(PAYLOAD));
    expect(roundTripped.variants[1]?.price).toBeNull();
  });

  it("lève une erreur technique franche sur une forme corrompue", () => {
    expect(() => readPayloadColumn({ title: "x" })).toThrow(CorruptedSnapshotError);
    expect(() => readPayloadColumn(null)).toThrow(CorruptedSnapshotError);
  });

  it("refuse un statut hors du vocabulaire Shopify", () => {
    const corrupt = {
      title: "Croissant",
      handle: "croissant",
      status: "PUBLISHED",
      variants: [],
    };
    expect(() => readPayloadColumn(corrupt)).toThrow(CorruptedSnapshotError);
  });
});
