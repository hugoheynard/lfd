import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import { ProductionContainerRepository } from "../../../domain/ports/production-container.repository.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { RemoveProductionContainerCommand } from "../remove-production-container.command.js";
import { RemoveProductionContainerHandler } from "../remove-production-container.handler.js";
import { SetProductionContainerCommand } from "../set-production-container.command.js";
import { SetProductionContainerHandler } from "../set-production-container.handler.js";

const TOURNEUSE: ContainerRule = {
  unitsPerContainer: 10,
  singular: "tourneuse",
  plural: "tourneuses",
};
const PLAQUE: ContainerRule = { unitsPerContainer: 8, singular: "plaque", plural: "plaques" };

/** Le réglage doublé : il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Containers extends ProductionContainerRepository {
  readonly rules = new Map<string, { rule: ContainerRule; by: string }>();
  readonly removed: string[] = [];

  save(sku: string, rule: ContainerRule, staffUserId: string): Promise<void> {
    this.rules.set(sku, { rule, by: staffUserId });
    return Promise.resolve();
  }

  remove(sku: string): Promise<void> {
    this.removed.push(sku);
    this.rules.delete(sku);
    return Promise.resolve();
  }
}

/** Le port de lecture, branché sur la même « table » que le dépôt doublé. */
class Reader extends ProductionContainerReader {
  constructor(private readonly table: Containers) {
    super();
  }

  allBySku(): Promise<ReadonlyMap<string, ContainerRule>> {
    return Promise.resolve(new Map([...this.table.rules].map(([sku, entry]) => [sku, entry.rule])));
  }
}

function subject() {
  const containers = new Containers();
  const reader = new Reader(containers);
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  return {
    containers,
    events,
    set: new SetProductionContainerHandler(containers, reader, events, uow),
    remove: new RemoveProductionContainerHandler(containers, reader, events, uow),
  };
}

describe("SetProductionContainerHandler", () => {
  it("pose le réglage avec l'identité du guard", async () => {
    const { set, containers } = subject();

    await set.execute(new SetProductionContainerCommand("PAI-BAG", TOURNEUSE, "staff-1"));

    expect(containers.rules.get("PAI-BAG")).toEqual({ rule: TOURNEUSE, by: "staff-1" });
  });

  it("remplace un réglage existant : le dernier est le vrai", async () => {
    const { set, containers } = subject();

    await set.execute(new SetProductionContainerCommand("PAI-BAG", TOURNEUSE, "staff-1"));
    await set.execute(new SetProductionContainerCommand("PAI-BAG", PLAQUE, "staff-2"));

    expect(containers.rules.size).toBe(1);
    expect(containers.rules.get("PAI-BAG")).toMatchObject({ by: "staff-2" });
  });

  it("JOURNALISE la pose, puis le remplacement avec le réglage d'avant", async () => {
    const { set, events } = subject();

    await set.execute(new SetProductionContainerCommand("PAI-BAG", TOURNEUSE, "staff-1"));
    await set.execute(new SetProductionContainerCommand("PAI-BAG", PLAQUE, "staff-2"));

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_container.set",
        subjectType: "production_container",
        subjectId: "PAI-BAG",
        payload: { subjectLabel: "PAI-BAG", before: null, after: TOURNEUSE },
      },
      {
        type: "production_container.set",
        subjectType: "production_container",
        subjectId: "PAI-BAG",
        payload: { subjectLabel: "PAI-BAG", before: TOURNEUSE, after: PLAQUE },
      },
    ]);
  });

  it("un contenant reposé à l'identique est réécrit, SANS fait", async () => {
    const { set, containers, events } = subject();
    await set.execute(new SetProductionContainerCommand("PAI-BAG", TOURNEUSE, "staff-1"));

    await set.execute(new SetProductionContainerCommand("PAI-BAG", { ...TOURNEUSE }, "staff-2"));

    expect(containers.rules.get("PAI-BAG")).toMatchObject({ by: "staff-2" });
    expect(events.factTypes()).toEqual(["production_container.set"]);
  });
});

describe("RemoveProductionContainerHandler", () => {
  it("retire le réglage, et le fait garde ce qu'il valait", async () => {
    const { set, remove, containers, events } = subject();
    await set.execute(new SetProductionContainerCommand("PAI-BAG", TOURNEUSE, "staff-1"));

    await remove.execute(new RemoveProductionContainerCommand("PAI-BAG"));

    expect(containers.rules.has("PAI-BAG")).toBe(false);
    expect(events.traced.at(-1)?.journalFact()).toEqual({
      type: "production_container.removed",
      subjectType: "production_container",
      subjectId: "PAI-BAG",
      payload: { subjectLabel: "PAI-BAG", before: TOURNEUSE },
    });
  });

  it("ne refuse pas un SKU jamais réglé, et n'écrit aucun fait", async () => {
    const { remove, containers, events } = subject();

    await remove.execute(new RemoveProductionContainerCommand("INCONNU"));

    expect(containers.removed).toEqual(["INCONNU"]);
    expect(events.published).toEqual([]);
  });
});
