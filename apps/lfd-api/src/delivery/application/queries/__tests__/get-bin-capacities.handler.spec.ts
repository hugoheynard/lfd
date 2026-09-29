import type { BinTypeView } from "@lfd/contracts";

import { FixedBinCatalog, FixedDeliveryProducts } from "../../commands/__tests__/bin-doubles.js";
import { GetBinCapacitiesHandler } from "../get-bin-capacities.handler.js";

function view(id: string, archivedAt: string | null): BinTypeView {
  return {
    id,
    name: id,
    outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
    inner: { lengthCm: 56, widthCm: 36, heightCm: 20 },
    innerVolumeLiters: 40,
    isotherm: false,
    maxStack: 6,
    divisible: true,
    archivedAt,
  };
}

describe("GetBinCapacitiesHandler", () => {
  it("croise les produits vendus, les types en service et leurs cases", async () => {
    const handler = new GetBinCapacitiesHandler(
      new FixedBinCatalog(
        [view("bin_a", null), view("bin_old", "2026-01-01T00:00:00.000Z")],
        [
          { binTypeId: "bin_a", sku: "VIE-001", units: 24 },
          // Un produit qui ne se vend plus : sa case reste en base, pas dans la grille.
          { binTypeId: "bin_a", sku: "RETIRE-1", units: 10 },
        ],
      ),
      new FixedDeliveryProducts([
        { sku: "VIE-001", name: "Croissant", requiresCold: false },
        { sku: "PAIN-002", name: "Baguette", requiresCold: false },
      ]),
    );

    const grid = await handler.execute();

    expect(grid.products).toEqual([
      { sku: "VIE-001", name: "Croissant", requiresCold: false },
      { sku: "PAIN-002", name: "Baguette", requiresCold: false },
    ]);
    expect(grid.types.map((type) => type.id)).toEqual(["bin_a"]);
    expect(grid.capacities).toEqual([{ binTypeId: "bin_a", sku: "VIE-001", units: 24 }]);
  });
});
