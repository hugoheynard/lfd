import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  SimulationScenarioAlreadyArchivedError,
  SimulationScenarioNameTakenError,
  SimulationScenarioNotFoundError,
  SimulationScenarioUnreadableError,
} from "../../../domain/errors/delivery-simulation-errors.js";
import { GetSimulationScenarioHandler } from "../../queries/get-simulation-scenario.handler.js";
import { GetSimulationScenarioQuery } from "../../queries/get-simulation-scenario.query.js";
import { ListSimulationScenariosHandler } from "../../queries/list-simulation-scenarios.handler.js";
import { ArchiveSimulationScenarioCommand } from "../archive-simulation-scenario.command.js";
import { ArchiveSimulationScenarioHandler } from "../archive-simulation-scenario.handler.js";
import { DuplicateSimulationScenarioCommand } from "../duplicate-simulation-scenario.command.js";
import { DuplicateSimulationScenarioHandler } from "../duplicate-simulation-scenario.handler.js";
import { RecordSimulationScenarioCommand } from "../record-simulation-scenario.command.js";
import { RecordSimulationScenarioHandler } from "../record-simulation-scenario.handler.js";
import { ReplaceSimulationScenarioCommand } from "../replace-simulation-scenario.command.js";
import { ReplaceSimulationScenarioHandler } from "../replace-simulation-scenario.handler.js";
import { InMemorySimulationScenarios, scenarioNamed, SIMULATION } from "./simulation-doubles.js";

const NOW = new Date(0);
const UNREADABLE = { readable: false, reason: "stops : au moins un arrêt" } as const;

function world(...existing: Parameters<typeof scenarioNamed>[]) {
  const scenarios = new InMemorySimulationScenarios(
    ...existing.map((args) => scenarioNamed(...args)),
  );
  const events = new RecordingPublisher();
  const directory = new FixedStaffAuthorDirectory(
    authorsKnownAs(
      { firstName: "Anne", lastName: "B", staffUserId: "staff_2", role: "admin" },
      "staff_2",
    ),
  );
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  const ids = new FixedIdGenerator("sc");
  return {
    scenarios,
    events,
    record: new RecordSimulationScenarioHandler(scenarios, directory, ids, clock, events, uow),
    replace: new ReplaceSimulationScenarioHandler(scenarios, directory, clock, events, uow),
    duplicate: new DuplicateSimulationScenarioHandler(
      scenarios,
      directory,
      ids,
      clock,
      events,
      uow,
    ),
    archive: new ArchiveSimulationScenarioHandler(scenarios, directory, clock, events, uow),
    list: new ListSimulationScenariosHandler(scenarios.reader),
    get: new GetSimulationScenarioHandler(scenarios.reader),
  };
}

const save = (name: string) => ({ name, scenario: SIMULATION });

describe("les scénarios du simulateur (L9-C7)", () => {
  it("enregistre un scénario, avec son auteur, et le trace", async () => {
    const w = world();

    const id = await w.record.execute(
      new RecordSimulationScenarioCommand(save("Mardi"), "staff_2"),
    );

    expect(await w.list.execute()).toEqual([
      {
        id,
        name: "Mardi",
        stops: 1,
        vehicles: 1,
        updatedAt: NOW.toISOString(),
        updatedBy: "Anne B",
      },
    ]);
    expect(w.events.factTypes()).toEqual(["delivery_simulation_scenario.created"]);
    expect(w.events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Mardi",
      stops: 1,
      vehicles: 1,
    });
  });

  it("refuse un nom déjà porté par un scénario vivant, sans rien écrire", async () => {
    const w = world(["sc_old", "Mardi"]);

    await expect(
      w.record.execute(new RecordSimulationScenarioCommand(save("Mardi"), "staff_2")),
    ).rejects.toThrow(SimulationScenarioNameTakenError);
    expect(w.scenarios.saved).toEqual([]);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("un nom archivé se reprend", async () => {
    const w = world(["sc_old", "Mardi"]);
    await w.archive.execute(new ArchiveSimulationScenarioCommand("sc_old", "staff_2"));

    await w.record.execute(new RecordSimulationScenarioCommand(save("Mardi"), "staff_2"));

    expect((await w.list.execute()).map((s) => s.name)).toEqual(["Mardi"]);
  });

  it("remplace le nom et le contenu ; le fait dit l'ancien nom", async () => {
    const w = world(["sc_1", "Mardi"]);
    const bigger = { ...SIMULATION, vehicles: ["Kangoo", "Trafic"] };

    await w.replace.execute(
      new ReplaceSimulationScenarioCommand(
        "sc_1",
        { name: "Mercredi", scenario: bigger },
        "staff_2",
      ),
    );

    const view = await w.get.execute(new GetSimulationScenarioQuery("sc_1"));
    expect(view).toMatchObject({ name: "Mercredi", scenario: bigger });
    expect(w.events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Mercredi",
      renamedFrom: "Mardi",
      stops: 1,
      vehicles: 2,
    });
  });

  it("garder son propre nom en remplaçant n'est pas un doublon", async () => {
    const w = world(["sc_1", "Mardi"]);

    await w.replace.execute(new ReplaceSimulationScenarioCommand("sc_1", save("Mardi"), "staff_2"));

    expect(w.events.traced[0]?.journalFact().payload).toMatchObject({ renamedFrom: null });
  });

  it("refuse de prendre le nom d'un autre scénario vivant", async () => {
    const w = world(["sc_1", "Mardi"], ["sc_2", "Mercredi"]);

    await expect(
      w.replace.execute(new ReplaceSimulationScenarioCommand("sc_1", save("Mercredi"), "staff_2")),
    ).rejects.toThrow(SimulationScenarioNameTakenError);
  });

  it("duplique sous le premier nom de copie libre, et trace la source", async () => {
    const w = world(["sc_1", "Mardi"], ["sc_2", "Mardi (copie)"]);

    const id = await w.duplicate.execute(new DuplicateSimulationScenarioCommand("sc_1", "staff_2"));

    const copy = await w.get.execute(new GetSimulationScenarioQuery(id));
    expect(copy).toMatchObject({ name: "Mardi (copie 2)", scenario: SIMULATION });
    expect(w.events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Mardi (copie 2)",
      source: { id: "sc_1", name: "Mardi" },
    });
  });

  it("archive : le scénario sort de la liste et ne se rouvre plus", async () => {
    const w = world(["sc_1", "Mardi"]);

    await w.archive.execute(new ArchiveSimulationScenarioCommand("sc_1", "staff_2"));

    expect(await w.list.execute()).toEqual([]);
    await expect(w.get.execute(new GetSimulationScenarioQuery("sc_1"))).rejects.toThrow(
      SimulationScenarioNotFoundError,
    );
    await expect(
      w.archive.execute(new ArchiveSimulationScenarioCommand("sc_1", "staff_2")),
    ).rejects.toThrow(SimulationScenarioAlreadyArchivedError);
    expect(w.events.factTypes()).toEqual(["delivery_simulation_scenario.archived"]);
  });

  it("un archivé ne se remplace ni ne se duplique : il n'existe plus pour l'écran", async () => {
    const w = world(["sc_1", "Mardi"]);
    await w.archive.execute(new ArchiveSimulationScenarioCommand("sc_1", "staff_2"));

    await expect(
      w.replace.execute(new ReplaceSimulationScenarioCommand("sc_1", save("X"), "staff_2")),
    ).rejects.toThrow(SimulationScenarioNotFoundError);
    await expect(
      w.duplicate.execute(new DuplicateSimulationScenarioCommand("sc_1", "staff_2")),
    ).rejects.toThrow(SimulationScenarioNotFoundError);
  });

  it("un scénario inconnu : 404 à chaque geste", async () => {
    const w = world();

    await expect(
      w.archive.execute(new ArchiveSimulationScenarioCommand("sc_x", "staff_2")),
    ).rejects.toThrow(SimulationScenarioNotFoundError);
  });

  describe("un scénario qui ne se relit plus", () => {
    it("se refuse à la réouverture en le nommant — jamais une 500", async () => {
      const w = world(["sc_1", "Mardi", UNREADABLE]);

      await expect(w.get.execute(new GetSimulationScenarioQuery("sc_1"))).rejects.toThrow(
        SimulationScenarioUnreadableError,
      );
    });

    it("reste dans la liste, et s'archive", async () => {
      const w = world(["sc_1", "Mardi", UNREADABLE]);

      expect((await w.list.execute()).map((s) => s.stops)).toEqual([0]);
      await w.archive.execute(new ArchiveSimulationScenarioCommand("sc_1", "staff_2"));
      expect(await w.list.execute()).toEqual([]);
    });

    it("ne se duplique pas", async () => {
      const w = world(["sc_1", "Mardi", UNREADABLE]);

      await expect(
        w.duplicate.execute(new DuplicateSimulationScenarioCommand("sc_1", "staff_2")),
      ).rejects.toThrow(SimulationScenarioUnreadableError);
    });
  });
});
