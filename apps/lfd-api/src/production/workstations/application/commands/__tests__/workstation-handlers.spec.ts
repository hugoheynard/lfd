import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { IntentKeyReusedError } from "../../../../../platform/intent/intent-errors.js";
import {
  InvalidProductSkuError,
  InvalidWorkstationNameError,
  WorkstationArchivedError,
  WorkstationNameTakenError,
  WorkstationNotFoundError,
  WorkstationOrderMismatchError,
  WorkstationStillUsedError,
} from "../../../domain/errors/workstation-errors.js";
import {
  InMemoryWorkstationMaps,
  STAFF_ID,
  station,
  workstationTools,
} from "../../__tests__/workstation-doubles.js";
import { ArchiveWorkstationCommand } from "../archive-workstation.command.js";
import { ArchiveWorkstationHandler } from "../archive-workstation.handler.js";
import { DeclareWorkstationCommand } from "../declare-workstation.command.js";
import { DeclareWorkstationHandler } from "../declare-workstation.handler.js";
import { PlaceProductsCommand } from "../place-products.command.js";
import { PlaceProductsHandler } from "../place-products.handler.js";
import { RenameWorkstationCommand } from "../rename-workstation.command.js";
import { RenameWorkstationHandler } from "../rename-workstation.handler.js";
import { ReorderWorkstationsCommand } from "../reorder-workstations.command.js";
import { ReorderWorkstationsHandler } from "../reorder-workstations.handler.js";

/** L'instant du geste : il n'est comparé qu'à ce que le geste écrit. */
const NOW = new Date("2026-11-16T09:00:00.000Z");
let keys = 0;
/** Une clé d'intention neuve par geste voulu, comme l'écran. */
const nextKey = (): string => `ws_intent_${(keys += 1)}`;

function twoStations(placements: ReadonlyMap<string, string> = new Map()): InMemoryWorkstationMaps {
  return new InMemoryWorkstationMaps(
    [station("ws_bread", "Boulangerie", 0), station("ws_pastry", "Pâtisserie", 1)],
    placements,
  );
}

describe("DeclareWorkstationHandler", () => {
  it("ajoute le poste en dernier, signé, et le journalise", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new DeclareWorkstationHandler(
      tools.gesture,
      tools.intents,
      new FixedIdGenerator("ws"),
    );

    const id = await handler.execute(
      new DeclareWorkstationCommand("  Tourier ", STAFF_ID, nextKey()),
    );

    expect(id).toBe("ws_000001");
    expect(maps.station(id)).toEqual({
      id,
      name: "Tourier",
      position: 2,
      archivedAt: null,
      trackingLevel: null,
    });
    expect(maps.saved[0]?.stamp).toEqual({
      at: NOW,
      staffUserId: STAFF_ID,
      name: "Colette Martin",
    });
    expect(tools.events.factTypes()).toEqual(["production_workstation.declared"]);
    expect(tools.events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "production_workstation",
      subjectId: id,
      payload: { subjectLabel: "Tourier", position: 2 },
    });
  });

  /** Régression attendue : un double clic sur « Ajouter » créerait deux postes. */
  it("rejoué avec la même clé, rend le même identifiant sans rien écrire de plus", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new DeclareWorkstationHandler(
      tools.gesture,
      tools.intents,
      new FixedIdGenerator("ws"),
    );
    const command = new DeclareWorkstationCommand("Tourier", STAFF_ID, nextKey());

    const first = await handler.execute(command);
    const replayed = await handler.execute(command);

    expect(replayed).toBe(first);
    expect(maps.saved).toHaveLength(1);
  });

  it("refuse un nom déjà porté par un poste en service, casse ignorée, sans rien écrire", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new DeclareWorkstationHandler(
      tools.gesture,
      tools.intents,
      new FixedIdGenerator(),
    );

    await expect(
      handler.execute(new DeclareWorkstationCommand("pâtisserie", STAFF_ID, nextKey())),
    ).rejects.toBeInstanceOf(WorkstationNameTakenError);
    await expect(
      handler.execute(new DeclareWorkstationCommand("   ", STAFF_ID, nextKey())),
    ).rejects.toBeInstanceOf(InvalidWorkstationNameError);
    expect(maps.saved).toEqual([]);
    expect(tools.events.traced).toEqual([]);
  });

  it("refuse la même clé renvoyée avec un autre nom", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new DeclareWorkstationHandler(
      tools.gesture,
      tools.intents,
      new FixedIdGenerator(),
    );
    const key = nextKey();

    await handler.execute(new DeclareWorkstationCommand("Tourier", STAFF_ID, key));

    await expect(
      handler.execute(new DeclareWorkstationCommand("Revente", STAFF_ID, key)),
    ).rejects.toBeInstanceOf(IntentKeyReusedError);
  });
});

describe("RenameWorkstationHandler", () => {
  it("renomme et dit l'ancien nom au journal", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new RenameWorkstationHandler(tools.gesture, tools.intents);

    await handler.execute(
      new RenameWorkstationCommand("ws_pastry", "Pâtisserie fine", STAFF_ID, nextKey()),
    );

    expect(maps.station("ws_pastry")?.name).toBe("Pâtisserie fine");
    expect(tools.events.traced[0]?.journalFact()).toMatchObject({
      type: "production_workstation.renamed",
      payload: { subjectLabel: "Pâtisserie fine", previous: { name: "Pâtisserie" } },
    });
  });

  it("reposer le même nom n'écrit ni ne journalise rien", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new RenameWorkstationHandler(tools.gesture, tools.intents);

    await handler.execute(
      new RenameWorkstationCommand("ws_pastry", "Pâtisserie", STAFF_ID, nextKey()),
    );

    expect(maps.saved).toEqual([]);
    expect(tools.events.traced).toEqual([]);
  });

  it("refuse un poste inconnu, et le nom d'un autre poste", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new RenameWorkstationHandler(tools.gesture, tools.intents);

    await expect(
      handler.execute(new RenameWorkstationCommand("ws_ghost", "Four", STAFF_ID, nextKey())),
    ).rejects.toBeInstanceOf(WorkstationNotFoundError);
    await expect(
      handler.execute(
        new RenameWorkstationCommand("ws_pastry", "BOULANGERIE", STAFF_ID, nextKey()),
      ),
    ).rejects.toBeInstanceOf(WorkstationNameTakenError);
    expect(maps.saved).toEqual([]);
  });
});

describe("ReorderWorkstationsHandler", () => {
  it("pose le nouvel ordre et le journalise dans l'ordre", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new ReorderWorkstationsHandler(tools.gesture, tools.intents);

    await handler.execute(
      new ReorderWorkstationsCommand(["ws_pastry", "ws_bread"], STAFF_ID, nextKey()),
    );

    expect(maps.station("ws_pastry")?.position).toBe(0);
    expect(maps.station("ws_bread")?.position).toBe(1);
    expect(tools.events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Postes du fournil",
      order: [
        { id: "ws_pastry", name: "Pâtisserie" },
        { id: "ws_bread", name: "Boulangerie" },
      ],
    });
  });

  it("le même ordre n'écrit rien ; un ordre incomplet est refusé", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new ReorderWorkstationsHandler(tools.gesture, tools.intents);

    await handler.execute(
      new ReorderWorkstationsCommand(["ws_bread", "ws_pastry"], STAFF_ID, nextKey()),
    );
    await expect(
      handler.execute(new ReorderWorkstationsCommand(["ws_bread"], STAFF_ID, nextKey())),
    ).rejects.toBeInstanceOf(WorkstationOrderMismatchError);

    expect(maps.saved).toEqual([]);
    expect(tools.events.traced).toEqual([]);
  });
});

describe("ArchiveWorkstationHandler", () => {
  it("archive un poste vide à l'instant de l'horloge", async () => {
    const maps = twoStations();
    const tools = workstationTools(maps, NOW);
    const handler = new ArchiveWorkstationHandler(tools.gesture, tools.intents, tools.clock);

    await handler.execute(new ArchiveWorkstationCommand("ws_pastry", STAFF_ID, nextKey()));

    expect(maps.station("ws_pastry")?.archivedAt).toEqual(NOW);
    expect(tools.events.factTypes()).toEqual(["production_workstation.archived"]);
  });

  it("refuse d'archiver un poste qui porte des produits, puis un poste déjà archivé", async () => {
    const maps = twoStations(new Map([["QUI-001", "ws_pastry"]]));
    const tools = workstationTools(maps, NOW);
    const handler = new ArchiveWorkstationHandler(tools.gesture, tools.intents, tools.clock);

    await expect(
      handler.execute(new ArchiveWorkstationCommand("ws_pastry", STAFF_ID, nextKey())),
    ).rejects.toBeInstanceOf(WorkstationStillUsedError);

    await handler.execute(new ArchiveWorkstationCommand("ws_bread", STAFF_ID, nextKey()));
    await expect(
      handler.execute(new ArchiveWorkstationCommand("ws_bread", STAFF_ID, nextKey())),
    ).rejects.toBeInstanceOf(WorkstationArchivedError);
    expect(maps.saved).toHaveLength(1);
  });
});

describe("PlaceProductsHandler", () => {
  it("place les produits et ne nomme au journal que ceux qui ont changé", async () => {
    const maps = twoStations(new Map([["QUI-001", "ws_pastry"]]));
    const tools = workstationTools(maps, NOW);
    const handler = new PlaceProductsHandler(tools.gesture, tools.intents);

    await handler.execute(
      new PlaceProductsCommand(["QUI-001", "TAR-002"], "ws_pastry", STAFF_ID, nextKey()),
    );

    expect(maps.workstationOf("TAR-002")).toBe("ws_pastry");
    expect(tools.events.traced[0]?.journalFact()).toMatchObject({
      type: "production_workstation.products_placed",
      subjectId: "ws_pastry",
      payload: {
        subjectLabel: "Pâtisserie",
        workstation: { id: "ws_pastry", name: "Pâtisserie" },
        skus: ["TAR-002"],
        count: 1,
      },
    });
  });

  it("remet « à ranger » avec `null`, sujet la carte entière", async () => {
    const maps = twoStations(new Map([["QUI-001", "ws_pastry"]]));
    const tools = workstationTools(maps, NOW);
    const handler = new PlaceProductsHandler(tools.gesture, tools.intents);

    await handler.execute(new PlaceProductsCommand(["QUI-001"], null, STAFF_ID, nextKey()));

    expect(maps.workstationOf("QUI-001")).toBeNull();
    expect(maps.saved[0]?.placements).toEqual(new Map([["QUI-001", null]]));
    expect(tools.events.traced[0]?.journalFact()).toMatchObject({
      subjectId: "house",
      payload: { subjectLabel: "À ranger", workstation: null, skus: ["QUI-001"], count: 1 },
    });
  });

  it("placer là où ils sont déjà n'écrit ni ne journalise rien", async () => {
    const maps = twoStations(new Map([["QUI-001", "ws_pastry"]]));
    const tools = workstationTools(maps, NOW);
    const handler = new PlaceProductsHandler(tools.gesture, tools.intents);

    await handler.execute(new PlaceProductsCommand(["QUI-001"], "ws_pastry", STAFF_ID, nextKey()));

    expect(maps.saved).toEqual([]);
    expect(tools.events.traced).toEqual([]);
  });

  it("refuse un poste archivé ou inconnu, et une référence vide, sans rien écrire", async () => {
    const maps = new InMemoryWorkstationMaps([
      { ...station("ws_old", "Ancien four", 0), archivedAt: NOW },
    ]);
    const tools = workstationTools(maps, NOW);
    const handler = new PlaceProductsHandler(tools.gesture, tools.intents);

    await expect(
      handler.execute(new PlaceProductsCommand(["QUI-001"], "ws_old", STAFF_ID, nextKey())),
    ).rejects.toBeInstanceOf(WorkstationArchivedError);
    await expect(
      handler.execute(new PlaceProductsCommand(["QUI-001"], "ws_ghost", STAFF_ID, nextKey())),
    ).rejects.toBeInstanceOf(WorkstationNotFoundError);
    await expect(
      handler.execute(new PlaceProductsCommand(["  "], null, STAFF_ID, nextKey())),
    ).rejects.toBeInstanceOf(InvalidProductSkuError);
    expect(maps.saved).toEqual([]);
  });
});
