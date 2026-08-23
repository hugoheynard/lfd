import type { ShopifyProductPayload } from "../projection.js";
import { CorruptedSnapshotError, payloadColumn, readPayloadColumn } from "../snapshot-payload.js";

const PAYLOAD: ShopifyProductPayload = {
  title: "Croissant",
  handle: "croissant",
  status: "DRAFT",
  descriptionHtml: "",
  vendor: null,
  seo: { title: "", description: "" },
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

/**
 * Un snapshot écrit AVANT que la description existe n'est pas corrompu — un
 * historique ne se relit pas avec les exigences du présent. Sans ça, le premier
 * rollback vers une version ancienne tomberait sur « snapshot corrompu ».
 */
describe("relecture d’un snapshot antérieur aux textes", () => {
  it("lit « rien de déclaré » plutôt que de refuser", () => {
    const ancien = {
      title: "Croissant",
      handle: "croissant",
      status: "DRAFT",
      variants: [{ sku: "PATI-CROISSANT", title: "Nature", options: {}, price: "1.30" }],
    };

    const payload = readPayloadColumn(ancien);

    expect(payload.descriptionHtml).toBe("");
    expect(payload.vendor).toBeNull();
    expect(payload.seo).toEqual({ title: "", description: "" });
  });
});

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
