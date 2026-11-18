import type { PackingTrackingLevel } from "../packing-tracking-level.js";
import { PackingSheet } from "../packing-sheet.js";

function sheet(trackingLevel?: PackingTrackingLevel | null): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2030-03-12",
    orderId: "ord_1",
    reference: "ORD-0001",
    packed: null,
    containers: 0,
    lines: [],
    containerMode: "listed",
    containerList: [],
    fulfillmentMethod: "pickup",
    ...(trackingLevel === undefined ? {} : { trackingLevel }),
  });
}

describe("PackingSheet — le niveau de suivi figé (D3)", () => {
  it("rien de figé — fiche d'avant la colonne, livraison — se lit détaillé", () => {
    expect(sheet().trackingLevel).toBe("detailed");
    expect(sheet(null).trackingLevel).toBe("detailed");
  });

  it("un niveau figé se lit tel quel", () => {
    expect(sheet("simple").trackingLevel).toBe("simple");
  });

  it("l'instantané rend ce qui était figé, `null` compris", () => {
    expect(sheet("simple").toSnapshot().trackingLevel).toBe("simple");
    expect(sheet(null).toSnapshot().trackingLevel).toBeNull();
  });
});
