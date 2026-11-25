import type { ProductStation } from "../../../domain/entities/product-placements.js";
import {
  FinishingWorkstationStillNeededError,
  WorkstationNotOfProductError,
} from "../../../domain/errors/workstation-errors.js";
import {
  InMemoryWorkstationMaps,
  STAFF_ID,
  station,
  workstationTools,
} from "../../__tests__/workstation-doubles.js";
import { AddWorkstationToProductsCommand } from "../add-workstation-to-products.command.js";
import { AddWorkstationToProductsHandler } from "../add-workstation-to-products.handler.js";
import { RemoveWorkstationFromProductsCommand } from "../remove-workstation-from-products.command.js";
import { RemoveWorkstationFromProductsHandler } from "../remove-workstation-from-products.handler.js";
import { SetFinishingWorkstationCommand } from "../set-finishing-workstation.command.js";
import { SetFinishingWorkstationHandler } from "../set-finishing-workstation.handler.js";

/** L'instant du geste : il n'est comparé qu'à ce que le geste écrit. */
const NOW = new Date("2026-11-25T09:00:00.000Z");
let keys = 0;
/** Une clé d'intention neuve par geste voulu, comme l'écran. */
const nextKey = (): string => `ws_stations_${(keys += 1)}`;

/** Boulangerie et Salé traiteur ; le sandwich fini au Salé traiteur, étape à la Boulangerie. */
function sandwichOnTwo(): InMemoryWorkstationMaps {
  return new InMemoryWorkstationMaps(
    [station("ws_bread", "Boulangerie", 0), station("ws_savory", "Salé traiteur", 1)],
    new Map<string, string | readonly ProductStation[]>([
      [
        "SAN-001",
        [
          { workstationId: "ws_savory", finishes: true, position: 0 },
          { workstationId: "ws_bread", finishes: false, position: 0 },
        ],
      ],
      ["BAG-002", "ws_bread"],
    ]),
  );
}

describe("AddWorkstationToProductsHandler", () => {
  it("ajoute le poste, et journalise ceux qu'il finit", async () => {
    const maps = new InMemoryWorkstationMaps(
      [station("ws_bread", "Boulangerie", 0), station("ws_savory", "Salé traiteur", 1)],
      new Map([["SAN-001", "ws_savory"]]),
    );
    const tools = workstationTools(maps, NOW);
    const handler = new AddWorkstationToProductsHandler(tools.gesture, tools.intents);

    await handler.execute(
      new AddWorkstationToProductsCommand("ws_bread", ["SAN-001", "PAI-003"], STAFF_ID, nextKey()),
    );

    expect(maps.workstationOf("SAN-001")).toBe("ws_savory");
    expect(maps.workstationOf("PAI-003")).toBe("ws_bread");
    expect(maps.saved[0]?.stamp).toEqual({
      at: NOW,
      staffUserId: STAFF_ID,
      name: "Colette Martin",
    });
    expect(tools.events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_workstation.products_workstation_added",
        subjectType: "production_workstation",
        subjectId: "ws_bread",
        payload: {
          subjectLabel: "Boulangerie",
          workstation: { id: "ws_bread", name: "Boulangerie" },
          skus: ["SAN-001", "PAI-003"],
          count: 2,
          finishingSkus: ["PAI-003"],
        },
      },
    ]);
  });

  it("rejouée avec la même clé, ne refait rien", async () => {
    const maps = new InMemoryWorkstationMaps([station("ws_bread", "Boulangerie", 0)]);
    const tools = workstationTools(maps, NOW);
    const handler = new AddWorkstationToProductsHandler(tools.gesture, tools.intents);
    const key = nextKey();

    await handler.execute(
      new AddWorkstationToProductsCommand("ws_bread", ["PAI-003"], STAFF_ID, key),
    );
    await handler.execute(
      new AddWorkstationToProductsCommand("ws_bread", ["PAI-003"], STAFF_ID, key),
    );

    expect(maps.saved).toHaveLength(1);
    expect(tools.events.traced).toHaveLength(1);
  });

  it("un poste qu'ils ont déjà : rien n'est écrit ni journalisé", async () => {
    const maps = sandwichOnTwo();
    const tools = workstationTools(maps, NOW);
    const handler = new AddWorkstationToProductsHandler(tools.gesture, tools.intents);

    await handler.execute(
      new AddWorkstationToProductsCommand("ws_bread", ["SAN-001"], STAFF_ID, nextKey()),
    );

    expect(maps.saved).toEqual([]);
    expect(tools.events.traced).toEqual([]);
  });
});

describe("RemoveWorkstationFromProductsHandler", () => {
  it("retire l'étape, réécrit le poste quitté, et journalise", async () => {
    const maps = sandwichOnTwo();
    const tools = workstationTools(maps, NOW);
    const handler = new RemoveWorkstationFromProductsHandler(tools.gesture, tools.intents);

    await handler.execute(
      new RemoveWorkstationFromProductsCommand("ws_bread", ["SAN-001"], STAFF_ID, nextKey()),
    );

    expect(maps.stationsOf("SAN-001").map((one) => one.workstationId)).toEqual(["ws_savory"]);
    expect(maps.saved[0]?.workstations.map((one) => one.id)).toEqual(["ws_bread"]);
    expect(tools.events.traced[0]?.journalFact()).toMatchObject({
      type: "production_workstation.products_workstation_removed",
      subjectId: "ws_bread",
      payload: { skus: ["SAN-001"], count: 1, unplacedSkus: [] },
    });
  });

  it("le dernier poste parti, le produit est « à ranger », et le fait le dit", async () => {
    const maps = sandwichOnTwo();
    const tools = workstationTools(maps, NOW);
    const handler = new RemoveWorkstationFromProductsHandler(tools.gesture, tools.intents);

    await handler.execute(
      new RemoveWorkstationFromProductsCommand("ws_bread", ["BAG-002"], STAFF_ID, nextKey()),
    );

    expect(maps.workstationOf("BAG-002")).toBeNull();
    expect(tools.events.traced[0]?.journalFact().payload).toMatchObject({
      unplacedSkus: ["BAG-002"],
    });
  });

  it("refuse de retirer celui qui finit tant qu'il en reste d'autres, sans rien écrire", async () => {
    const maps = sandwichOnTwo();
    const tools = workstationTools(maps, NOW);
    const handler = new RemoveWorkstationFromProductsHandler(tools.gesture, tools.intents);

    await expect(
      handler.execute(
        new RemoveWorkstationFromProductsCommand("ws_savory", ["SAN-001"], STAFF_ID, nextKey()),
      ),
    ).rejects.toBeInstanceOf(FinishingWorkstationStillNeededError);
    expect(maps.saved).toEqual([]);
    expect(tools.events.traced).toEqual([]);
  });
});

describe("SetFinishingWorkstationHandler", () => {
  it("échange le poste qui finit, et nomme l'ancien au journal", async () => {
    const maps = sandwichOnTwo();
    const tools = workstationTools(maps, NOW);
    const handler = new SetFinishingWorkstationHandler(tools.gesture, tools.intents);

    await handler.execute(
      new SetFinishingWorkstationCommand("ws_bread", "SAN-001", STAFF_ID, nextKey()),
    );

    expect(maps.workstationOf("SAN-001")).toBe("ws_bread");
    expect(maps.stationsOf("SAN-001").filter((one) => one.finishes)).toHaveLength(1);
    expect(tools.events.traced[0]?.journalFact()).toEqual({
      type: "production_workstation.finishing_workstation_set",
      subjectType: "production_workstation",
      subjectId: "ws_bread",
      payload: {
        subjectLabel: "Boulangerie",
        workstation: { id: "ws_bread", name: "Boulangerie" },
        sku: "SAN-001",
        previous: { workstation: { id: "ws_savory", name: "Salé traiteur" } },
      },
    });
  });

  it("le poste qui finit déjà : rien n'est écrit ni journalisé", async () => {
    const maps = sandwichOnTwo();
    const tools = workstationTools(maps, NOW);
    const handler = new SetFinishingWorkstationHandler(tools.gesture, tools.intents);

    await handler.execute(
      new SetFinishingWorkstationCommand("ws_savory", "SAN-001", STAFF_ID, nextKey()),
    );

    expect(maps.saved).toEqual([]);
    expect(tools.events.traced).toEqual([]);
  });

  it("refuse un poste qui n'est pas un poste du produit", async () => {
    const maps = sandwichOnTwo();
    const tools = workstationTools(maps, NOW);
    const handler = new SetFinishingWorkstationHandler(tools.gesture, tools.intents);

    await expect(
      handler.execute(
        new SetFinishingWorkstationCommand("ws_savory", "BAG-002", STAFF_ID, nextKey()),
      ),
    ).rejects.toBeInstanceOf(WorkstationNotOfProductError);
    expect(maps.saved).toEqual([]);
  });
});
