import { WorkstationNotFoundError } from "../../../domain/errors/workstation-errors.js";
import {
  InMemoryWorkstationMaps,
  STAFF_ID,
  station,
  workstationTools,
} from "../../__tests__/workstation-doubles.js";
import { SetWorkstationTrackingLevelCommand } from "../set-workstation-tracking-level.command.js";
import { SetWorkstationTrackingLevelHandler } from "../set-workstation-tracking-level.handler.js";

/**
 * **Le niveau de suivi d'un poste** (`fournil/les-niveaux-de-suivi.md`). L'instant du geste n'est comparé qu'à ce que le geste écrit.
 */
const NOW = new Date("2026-11-17T09:00:00.000Z");
let keys = 0;
const nextKey = (): string => `ws_level_${(keys += 1)}`;

function subject() {
  const maps = new InMemoryWorkstationMaps(
    [station("ws_bread", "Boulangerie", 0), station("ws_pastry", "Pâtisserie", 1)],
    new Map(),
  );
  const tools = workstationTools(maps, NOW);
  return {
    maps,
    tools,
    handler: new SetWorkstationTrackingLevelHandler(tools.gesture, tools.intents),
  };
}

describe("SetWorkstationTrackingLevelHandler", () => {
  it("pose le niveau propre, signé à l'instant du geste, et le journalise", async () => {
    const { maps, tools, handler } = subject();

    await handler.execute(
      new SetWorkstationTrackingLevelCommand("ws_pastry", "detailed", STAFF_ID, nextKey()),
    );

    expect(maps.station("ws_pastry")?.trackingLevel).toBe("detailed");
    expect(maps.saved[0]?.stamp.at).toEqual(NOW);
    expect(tools.events.traced[0]?.journalFact()).toMatchObject({
      type: "production_workstation.tracking_level_set",
      subjectId: "ws_pastry",
      payload: {
        subjectLabel: "Pâtisserie",
        trackingLevel: "detailed",
        previous: { trackingLevel: null },
      },
    });
  });

  it("reposer le même niveau n'écrit ni ne journalise rien", async () => {
    const { maps, tools, handler } = subject();

    await handler.execute(
      new SetWorkstationTrackingLevelCommand("ws_bread", null, STAFF_ID, nextKey()),
    );

    expect(maps.saved).toEqual([]);
    expect(tools.events.traced).toEqual([]);
  });

  it("rejoué avec la même clé, ne refait pas le geste", async () => {
    const { maps, handler } = subject();
    const key = nextKey();

    await handler.execute(
      new SetWorkstationTrackingLevelCommand("ws_pastry", "simple", STAFF_ID, key),
    );
    await handler.execute(
      new SetWorkstationTrackingLevelCommand("ws_pastry", "simple", STAFF_ID, key),
    );

    expect(maps.saved).toHaveLength(1);
  });

  it("refuse un poste inconnu, sans rien écrire", async () => {
    const { maps, handler } = subject();

    await expect(
      handler.execute(
        new SetWorkstationTrackingLevelCommand("ws_ghost", "simple", STAFF_ID, nextKey()),
      ),
    ).rejects.toBeInstanceOf(WorkstationNotFoundError);
    expect(maps.saved).toEqual([]);
  });
});
