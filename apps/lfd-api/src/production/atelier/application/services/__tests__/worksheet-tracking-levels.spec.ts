import type { CatalogFamilyView } from "@lfd/contracts";

import { ServiceDay } from "../../../../day/index.js";
import { GroupingSourceReading, WorkstationOfProducts } from "../../../../workstations/index.js";
import {
  FailingWorkstationOfProducts,
  FixedWorkstationOfProducts,
  article,
  placementPorts,
} from "../../../../workstations/application/__tests__/placement-doubles.js";
import type { DayTrackingLevels } from "../../../domain/services/tracking-levels.js";
import { WorksheetTrackingLevelsReading } from "../worksheet-tracking-levels.js";

/**
 * **Le niveau de sortie et le niveau d'étape d'une ligne** (plan
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.4) : le
 * poste qui finit règle la fournée, chaque poste d'étape règle son étape,
 * chacun au niveau que la journée a figé pour lui.
 */
const DAY = ServiceDay.of("2026-11-26");
const SALTY: CatalogFamilyView = { id: "fam-salty", name: "Traiteur salé", position: 0 };
const NO_GROUPING_READ = { mode: "shelf", shelves: null } as const;
const STATIONS = [
  { id: "ws_bread", name: "Boulangerie", position: 0 },
  { id: "ws_savory", name: "Salé traiteur", position: 1 },
];

/** Le sandwich : le pain à la Boulangerie (étape), la garniture au Salé traiteur (finit). */
function reading(
  workstations: WorkstationOfProducts = FixedWorkstationOfProducts.withStations(
    STATIONS,
    new Map([
      [
        "SAN",
        [
          { workstationId: "ws_savory", finishes: true, position: null },
          { workstationId: "ws_bread", finishes: false, position: null },
        ],
      ],
    ]),
  ),
): WorksheetTrackingLevelsReading {
  return new WorksheetTrackingLevelsReading(
    new GroupingSourceReading(...placementPorts([article("SAN-1", "SAN", SALTY)], workstations)),
  );
}

function levels(bread: "always_green" | "detailed", savory: "always_green" | "detailed") {
  return {
    house: "simple",
    workstations: new Map([
      ["ws_bread", bread],
      ["ws_savory", savory],
    ]),
  } satisfies DayTrackingLevels;
}

describe("WorksheetTrackingLevelsReading — sortie et étape", () => {
  it("le niveau de sortie est celui du poste qui finit, l'étape celui de son poste", async () => {
    const tracked = await reading().read(
      DAY,
      levels("always_green", "detailed"),
      ["SAN-1"],
      NO_GROUPING_READ,
    );

    expect(tracked.known).toBe(true);
    expect(tracked.outputLevelOf("SAN-1")).toBe("detailed");
    expect(tracked.stepLevelOf("SAN-1", "ws_bread")).toBe("always_green");
  });

  it("le cas inverse : la sortie en toujours vert, l'étape en détaillé", async () => {
    const tracked = await reading().read(
      DAY,
      levels("detailed", "always_green"),
      ["SAN-1"],
      NO_GROUPING_READ,
    );

    expect(tracked.outputLevelOf("SAN-1")).toBe("always_green");
    expect(tracked.stepLevelOf("SAN-1", "ws_bread")).toBe("detailed");
  });

  it("un SKU sans poste et un poste sans niveau propre suivent le fournil", async () => {
    const tracked = await reading().read(
      DAY,
      levels("detailed", "detailed"),
      ["SAN-1", "GHOST"],
      NO_GROUPING_READ,
    );

    expect(tracked.outputLevelOf("GHOST")).toBe("simple");
    expect(tracked.stepLevelOf("SAN-1", "ws_unknown")).toBe("simple");
  });

  it("tous les postes au niveau du fournil : aucun poste n'est lu", async () => {
    const workstations = new FixedWorkstationOfProducts(STATIONS, new Map());
    const tracked = await reading(workstations).read(
      DAY,
      { house: "simple", workstations: new Map([["ws_bread", "simple"]]) },
      ["SAN-1"],
      NO_GROUPING_READ,
    );

    expect(workstations.asked).toEqual([]);
    expect(tracked.outputLevelOf("SAN-1")).toBe("simple");
    expect(tracked.stepLevelOf("SAN-1", "ws_bread")).toBe("simple");
  });

  it("des postes illisibles servent la sortie et l'étape en détaillé, et le disent", async () => {
    const tracked = await reading(new FailingWorkstationOfProducts()).read(
      DAY,
      levels("always_green", "always_green"),
      ["SAN-1"],
      NO_GROUPING_READ,
    );

    expect(tracked.known).toBe(false);
    expect(tracked.outputLevelOf("SAN-1")).toBe("detailed");
    expect(tracked.stepLevelOf("SAN-1", "ws_bread")).toBe("detailed");
  });
});
