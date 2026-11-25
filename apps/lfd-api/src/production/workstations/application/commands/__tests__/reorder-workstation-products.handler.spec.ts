import { IntentKeyReusedError } from "../../../../../platform/intent/intent-errors.js";
import {
  WorkstationArchivedError,
  WorkstationNotFoundError,
  WorkstationOrderMismatchError,
} from "../../../domain/errors/workstation-errors.js";
import {
  InMemoryWorkstationMaps,
  STAFF_ID,
  station,
  workstationTools,
} from "../../__tests__/workstation-doubles.js";
import { PlaceProductsCommand } from "../place-products.command.js";
import { PlaceProductsHandler } from "../place-products.handler.js";
import { ReorderWorkstationProductsCommand } from "../reorder-workstation-products.command.js";
import { ReorderWorkstationProductsHandler } from "../reorder-workstation-products.handler.js";

/** L'instant du geste : il n'est comparé qu'à ce que le geste écrit. */
const NOW = new Date("2026-11-25T09:00:00.000Z");
let keys = 0;
/** Une clé d'intention neuve par geste voulu, comme l'écran. */
const nextKey = (): string => `pile_intent_${(keys += 1)}`;

/** La Pâtisserie porte la quiche puis la tarte ; un poste archivé à côté. */
function pastry(): InMemoryWorkstationMaps {
  return new InMemoryWorkstationMaps(
    [
      station("ws_pastry", "Pâtisserie", 0),
      { ...station("ws_old", "Ancien four", 1), archivedAt: NOW },
    ],
    new Map([
      ["QUI-001", "ws_pastry"],
      ["TAR-002", "ws_pastry"],
    ]),
    new Map([
      ["QUI-001", 0],
      ["TAR-002", 1],
    ]),
  );
}

describe("ReorderWorkstationProductsHandler", () => {
  it("pose la pile, signée, et la journalise sur le poste", async () => {
    const maps = pastry();
    const tools = workstationTools(maps, NOW);
    const handler = new ReorderWorkstationProductsHandler(tools.gesture, tools.intents);

    await handler.execute(
      new ReorderWorkstationProductsCommand(
        "ws_pastry",
        ["TAR-002", "QUI-001"],
        STAFF_ID,
        nextKey(),
      ),
    );

    expect([maps.positionOf("TAR-002"), maps.positionOf("QUI-001")]).toEqual([0, 1]);
    // Chaque ligne réécrite l'est à l'instant du geste : le numéro de la carte monte.
    expect(maps.saved[0]?.stamp.at).toEqual(NOW);
    expect(tools.events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_workstation.products_reordered",
        subjectType: "production_workstation",
        subjectId: "ws_pastry",
        payload: { subjectLabel: "Pâtisserie", skus: ["TAR-002", "QUI-001"] },
      },
    ]);
  });

  it("la même pile, reposée, n'écrit ni ne journalise rien", async () => {
    const maps = pastry();
    const tools = workstationTools(maps, NOW);
    const handler = new ReorderWorkstationProductsHandler(tools.gesture, tools.intents);

    await handler.execute(
      new ReorderWorkstationProductsCommand(
        "ws_pastry",
        ["QUI-001", "TAR-002"],
        STAFF_ID,
        nextKey(),
      ),
    );

    expect(maps.saved).toEqual([]);
    expect(tools.events.traced).toEqual([]);
  });

  it("refuse une liste qui n'est pas la pile, un poste archivé ou inconnu, sans rien écrire", async () => {
    const maps = pastry();
    const tools = workstationTools(maps, NOW);
    const handler = new ReorderWorkstationProductsHandler(tools.gesture, tools.intents);
    const reorder = (id: string, skus: readonly string[]) =>
      handler.execute(new ReorderWorkstationProductsCommand(id, skus, STAFF_ID, nextKey()));

    await expect(reorder("ws_pastry", ["TAR-002"])).rejects.toBeInstanceOf(
      WorkstationOrderMismatchError,
    );
    await expect(reorder("ws_old", [])).rejects.toBeInstanceOf(WorkstationArchivedError);
    await expect(reorder("ws_ghost", [])).rejects.toBeInstanceOf(WorkstationNotFoundError);
    expect(maps.saved).toEqual([]);
  });

  it("refuse la même clé pour une autre pile", async () => {
    const tools = workstationTools(pastry(), NOW);
    const handler = new ReorderWorkstationProductsHandler(tools.gesture, tools.intents);
    const key = nextKey();

    await handler.execute(
      new ReorderWorkstationProductsCommand("ws_pastry", ["TAR-002", "QUI-001"], STAFF_ID, key),
    );

    await expect(
      handler.execute(
        new ReorderWorkstationProductsCommand("ws_pastry", ["QUI-001", "TAR-002"], STAFF_ID, key),
      ),
    ).rejects.toBeInstanceOf(IntentKeyReusedError);
  });

  it("un produit placé ensuite arrive en bas de la pile réglée", async () => {
    const maps = pastry();
    const tools = workstationTools(maps, NOW);

    await new PlaceProductsHandler(tools.gesture, tools.intents).execute(
      new PlaceProductsCommand(["FLA-003"], "ws_pastry", STAFF_ID, nextKey()),
    );

    expect(maps.positionOf("FLA-003")).toBe(2);
  });
});
