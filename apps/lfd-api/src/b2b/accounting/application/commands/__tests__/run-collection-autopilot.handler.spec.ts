import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  CollectionFloorMissingError,
  CollectionNotYetOpenError,
  NothingToCollectError,
} from "../../../domain/errors/collection-errors.js";
import {
  AutoCollectionEntitiesReader,
  type AutoCollectionEntity,
} from "../../../domain/ports/auto-collection-entities.reader.js";
import { AutomaticCollectionConstituter } from "../../../domain/ports/automatic-collection-constituter.js";
import {
  CollectionAutopilotRuns,
  type CollectionAutopilotOutcome,
  type SettledAutopilotOutcome,
} from "../../../domain/ports/collection-autopilot-runs.js";
import {
  ENTITY_ID,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { RunCollectionAutopilotHandler } from "../run-collection-autopilot.handler.js";
import { world } from "./collection-world.js";

/**
 * Le cycle de septembre se clôt le 1er octobre 2026 à 00h00 de Paris (22h00
 * UTC). Délai d'une heure : constitution prévue à 23h00 UTC. L'horloge est
 * FIXE ; les instants ne sont comparés qu'à cette clôture.
 */
const CLOSE = new Date("2026-09-30T22:00:00.000Z");
const BEFORE_PLANNED = new Date("2026-09-30T22:15:00.000Z");
const AFTER_PLANNED = new Date("2026-09-30T23:15:00.000Z");

interface StoredRun {
  outcome: CollectionAutopilotOutcome;
  message: string | null;
}

/** La table, en mémoire — la clé (entité, clôture) départage comme la base. */
class MemoryRuns extends CollectionAutopilotRuns {
  readonly rows = new Map<string, StoredRun>();
  readonly reads: string[] = [];

  attempted(legalEntityId: string, cycleClosesAt: Date): Promise<boolean> {
    this.reads.push(legalEntityId);
    return Promise.resolve(this.rows.has(key(legalEntityId, cycleClosesAt)));
  }
  claim(legalEntityId: string, cycleClosesAt: Date): Promise<boolean> {
    const k = key(legalEntityId, cycleClosesAt);
    if (this.rows.has(k)) {
      return Promise.resolve(false);
    }
    this.rows.set(k, { outcome: "pending", message: null });
    return Promise.resolve(true);
  }
  settle(
    legalEntityId: string,
    cycleClosesAt: Date,
    outcome: SettledAutopilotOutcome,
    message: string | null,
  ): Promise<void> {
    this.rows.set(key(legalEntityId, cycleClosesAt), { outcome, message });
    return Promise.resolve();
  }
  of(legalEntityId: string): StoredRun | undefined {
    return this.rows.get(key(legalEntityId, CLOSE));
  }
}

function key(legalEntityId: string, cycleClosesAt: Date): string {
  return `${legalEntityId}@${cycleClosesAt.toISOString()}`;
}

class FixedAutoEntities extends AutoCollectionEntitiesReader {
  constructor(private readonly entities: readonly AutoCollectionEntity[]) {
    super();
  }
  enabled(): Promise<readonly AutoCollectionEntity[]> {
    return Promise.resolve(this.entities);
  }
}

/** Une constitution scriptée : des lots, ou un refus. */
class ScriptedConstituter extends AutomaticCollectionConstituter {
  readonly calls: string[] = [];
  constructor(private readonly result: readonly string[] | Error) {
    super();
  }
  constitute(legalEntityId: string): Promise<readonly string[]> {
    this.calls.push(legalEntityId);
    return this.result instanceof Error
      ? Promise.reject(this.result)
      : Promise.resolve(this.result);
  }
}

const ENTITY: AutoCollectionEntity = {
  legalEntityId: ENTITY_ID,
  name: "Crazeativity",
  autoCollectionDelayHours: 1,
};

function autopilot(
  constituter: AutomaticCollectionConstituter,
  at: Date = AFTER_PLANNED,
  entities: readonly AutoCollectionEntity[] = [ENTITY],
) {
  const runs = new MemoryRuns();
  const events = new RecordingPublisher();
  const handler = new RunCollectionAutopilotHandler(
    new FixedAutoEntities(entities),
    runs,
    constituter,
    events,
    new FixedClock(at),
    new DirectUnitOfWork(),
  );
  return { handler, runs, events };
}

describe("le passage de la constitution automatique (PA3)", () => {
  it("constitue une fois l'heure passée, range l'issue et la journalise", async () => {
    const constituter = new ScriptedConstituter(["b1", "b2"]);
    const { handler, runs, events } = autopilot(constituter);

    const report = await handler.execute();

    expect(constituter.calls).toEqual([ENTITY_ID]);
    expect(runs.of(ENTITY_ID)).toEqual({ outcome: "constituted", message: null });
    expect(report.runs).toEqual([
      { legalEntityId: ENTITY_ID, cycleClosesAt: CLOSE.toISOString(), outcome: "constituted" },
    ]);
    expect(events.factTypes()).toEqual(["collection.autopilot_ran"]);
  });

  it("une seule tentative par cycle : le passage suivant lit la table et se tait", async () => {
    const constituter = new ScriptedConstituter(new NothingToCollectError(0));
    const { handler, runs, events } = autopilot(constituter);

    await handler.execute();
    const second = await handler.execute();

    expect(constituter.calls).toHaveLength(1);
    expect(second.runs).toEqual([]);
    expect(runs.reads).toEqual([ENTITY_ID, ENTITY_ID]);
    expect(events.factTypes()).toEqual(["collection.autopilot_ran"]);
  });

  it("l'heure prévue pas encore passée : ni lecture, ni constitution", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, runs } = autopilot(constituter, BEFORE_PLANNED);

    expect((await handler.execute()).runs).toEqual([]);
    expect(constituter.calls).toEqual([]);
    expect(runs.reads).toEqual([]);
  });

  it("une entité désactivée n'est pas lue : le lecteur ne la rend pas", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, runs } = autopilot(constituter, AFTER_PLANNED, []);

    await handler.execute();

    expect(constituter.calls).toEqual([]);
    expect(runs.rows.size).toBe(0);
  });

  it("un autre passage a pris la tentative entre la lecture et l'insertion : rien", async () => {
    const constituter = new ScriptedConstituter(["b1"]);
    const { handler, runs } = autopilot(constituter);
    runs.attempted = () => Promise.resolve(false);
    runs.rows.set(key(ENTITY_ID, CLOSE), { outcome: "pending", message: null });

    expect((await handler.execute()).runs).toEqual([]);
    expect(constituter.calls).toEqual([]);
  });

  it.each<[string, Error, SettledAutopilotOutcome]>([
    ["rien à prélever", new NothingToCollectError(0), "nothing_to_collect"],
    [
      "le plancher",
      new CollectionNotYetOpenError(new Date("2026-10-05T10:00:00.000Z"), CLOSE),
      "not_yet_open",
    ],
    ["une panne", new CollectionFloorMissingError(), "failed"],
  ])("%s : l'issue est rangée avec le message du refus", async (_, error, outcome) => {
    const { handler, runs, events } = autopilot(new ScriptedConstituter(error));

    await handler.execute();

    expect(runs.of(ENTITY_ID)).toEqual({ outcome, message: error.message });
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      outcome,
      message: error.message,
      batchCount: 0,
    });
  });

  it("une constitution qui n'a fait qu'écarter : « rien à prélever », expliqué", async () => {
    const { handler, runs } = autopilot(new ScriptedConstituter([]));

    await handler.execute();

    expect(runs.of(ENTITY_ID)?.outcome).toBe("nothing_to_collect");
    expect(runs.of(ENTITY_ID)?.message).toContain("écartées");
  });

  it("l'échec d'une entité n'empêche pas les autres", async () => {
    class OneFails extends AutomaticCollectionConstituter {
      constitute(legalEntityId: string): Promise<readonly string[]> {
        return legalEntityId === "le_casse"
          ? Promise.reject(new CollectionFloorMissingError())
          : Promise.resolve(["b1"]);
      }
    }
    const { handler } = autopilot(new OneFails(), AFTER_PLANNED, [
      { ...ENTITY, legalEntityId: "le_casse" },
      ENTITY,
    ]);

    const report = await handler.execute();

    expect(report.runs.map((run) => run.outcome)).toEqual(["failed", "constituted"]);
  });

  it("la vraie constitution, auteur `system` : le lot ne nomme aucune fiche staff", async () => {
    const w = world();
    w.clock.set(AFTER_PLANNED);
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    class ThroughHandler extends AutomaticCollectionConstituter {
      constitute(legalEntityId: string): Promise<readonly string[]> {
        return w.constitute.execute(
          new ConstituteCollectionBatchesCommand(legalEntityId, { kind: "system" }),
        );
      }
    }
    const { handler } = autopilot(new ThroughHandler());

    await handler.execute();

    const [batch] = [...w.batches.saved.values()];
    expect(batch?.toPersistence().constituted.by).toEqual({ kind: "system" });
    // Les avis partent comme pour le bouton (PA2).
    expect(w.events.factTypes()).toContain("collection.notice_queued");
  });
});
