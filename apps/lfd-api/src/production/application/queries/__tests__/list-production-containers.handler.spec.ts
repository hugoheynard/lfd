import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { ListProductionContainersHandler } from "../list-production-containers.handler.js";

/** Sortis de `get-production-worksheet.handler.spec.ts` le 2026-09-14 : un cas, un fichier. */
class Containers extends ProductionContainerReader {
  constructor(private readonly rules: ReadonlyMap<string, ContainerRule>) {
    super();
  }

  allBySku(): Promise<ReadonlyMap<string, ContainerRule>> {
    return Promise.resolve(this.rules);
  }
}

describe("ListProductionContainersHandler", () => {
  it("rend les réglages triés par SKU", async () => {
    const handler = new ListProductionContainersHandler(
      new Containers(
        new Map([
          ["VIE-CRO", { unitsPerContainer: 12, singular: "plaque", plural: "plaques" }],
          ["PAI-BAG", { unitsPerContainer: 10, singular: "tourneuse", plural: "tourneuses" }],
        ]),
      ),
    );

    const rows = await handler.execute();

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sku)).toEqual(["PAI-BAG", "VIE-CRO"]);
    expect(rows[0]).toEqual({
      sku: "PAI-BAG",
      unitsPerContainer: 10,
      singular: "tourneuse",
      plural: "tourneuses",
    });
  });

  it("rend une liste vide quand rien n'est réglé", async () => {
    const rows = await new ListProductionContainersHandler(new Containers(new Map())).execute();

    expect(rows).toEqual([]);
  });
});
