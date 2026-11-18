import { PackingTrackingLevelUnknownError } from "../../errors/packing-settings-errors.js";
import {
  packingTrackingLevelOf,
  readTrackingLevel,
  trackingLevelSourceOf,
} from "../packing-tracking-level.js";

describe("Le niveau de suivi d'une fiche du colisage (D1, D3)", () => {
  it("un retrait prend le réglage", () => {
    expect(trackingLevelSourceOf({ fulfillmentMethod: "pickup", rank: 1 })).toBe("setting");
  });

  it("un reliquat prend le niveau de sa fiche d'origine", () => {
    expect(trackingLevelSourceOf({ fulfillmentMethod: "pickup", rank: 2 })).toBe("origin");
  });

  it("une livraison, reliquat ou non, ne fige rien", () => {
    expect(trackingLevelSourceOf({ fulfillmentMethod: "delivery", rank: 1 })).toBe("none");
    expect(trackingLevelSourceOf({ fulfillmentMethod: "delivery", rank: 3 })).toBe("none");
  });

  it("rien de figé se lit détaillé ; un niveau figé se lit tel quel", () => {
    expect(readTrackingLevel(null)).toBe("detailed");
    expect(readTrackingLevel("simple")).toBe("simple");
  });

  it("reconnaît les deux niveaux et refuse le reste, en le nommant", () => {
    expect(packingTrackingLevelOf("simple")).toBe("simple");
    expect(packingTrackingLevelOf("detailed")).toBe("detailed");
    expect(() => packingTrackingLevelOf("always_green")).toThrow(PackingTrackingLevelUnknownError);
    expect(() => packingTrackingLevelOf("always_green")).toThrow(/« always_green »/);
  });
});
