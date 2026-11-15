import { ProductionTrancheSettings } from "../../entities/production-tranche-settings.js";
import type { DueNeed, SkuNeeds } from "../production-tranches.js";
import { trancheThresholdsBySku } from "../tranche-thresholds-by-sku.js";

const CROISSANT: SkuNeeds<DueNeed> = {
  sku: "CRO",
  productName: "Croissant",
  total: 10,
  thresholds: [{ kind: "deadline", before: "06:40", quantity: 10, cumulative: 10 }],
};

describe("trancheThresholdsBySku — les seuils de chaque SKU, rangés par le réglage", () => {
  it("range les besoins dans les tranches fixes posées", () => {
    const ranged = trancheThresholdsBySku(
      [CROISSANT],
      ProductionTrancheSettings.set("fixed", ["07:00", "05:00"]),
    );

    expect(ranged.get("CRO")).toEqual([
      { kind: "deadline", before: "05:00", quantity: 10, cumulative: 10 },
    ]);
  });

  it("sans réglage posé, prend les réglages par défaut : une seule tranche, la journée", () => {
    const ranged = trancheThresholdsBySku([CROISSANT], null);

    expect(ranged.get("CRO")).toEqual(
      trancheThresholdsBySku([CROISSANT], ProductionTrancheSettings.defaults()).get("CRO"),
    );
  });

  it("en mode calculé, ignore les heures fixes et rend les besoins tels quels", () => {
    const ranged = trancheThresholdsBySku(
      [CROISSANT],
      ProductionTrancheSettings.set("computed", []),
    );

    expect(ranged.get("CRO")).toEqual(CROISSANT.thresholds);
  });
});
