import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  AutoCollectionEntitiesReader,
  type AutoCollectionEntity,
} from "../../../domain/ports/auto-collection-entities.reader.js";
import { AutomaticCollectionConstituter } from "../../../domain/ports/automatic-collection-constituter.js";
import {
  AutopilotCoverageReader,
  type AutopilotCoverage,
} from "../../../domain/ports/autopilot-coverage.reader.js";
import {
  CollectionAutopilotRuns,
  type CollectionAutopilotOutcome,
  type SettledAutopilotOutcome,
} from "../../../domain/ports/collection-autopilot-runs.js";
import { ENTITY_ID } from "../../../domain/services/__tests__/collection-fixtures.js";
import { RunCollectionAutopilotHandler } from "../run-collection-autopilot.handler.js";
import { FixedRhythms } from "./monthly-invoice-doubles.js";

/**
 * Les doubles du passage automatique (PA3, R4b), partagés par
 * `run-collection-autopilot.handler.spec.ts` et
 * `run-collection-autopilot-missed.handler.spec.ts`.
 *
 * Le cycle de septembre se clôt le 1er octobre 2026 à 00h00 de Paris (22h00
 * UTC). Délai d'une heure : constitution prévue à 23h00 UTC. L'horloge est
 * FIXE ; les instants ne sont comparés qu'à cette clôture.
 */
export const CLOSE = new Date("2026-09-30T22:00:00.000Z");
export const BEFORE_PLANNED = new Date("2026-09-30T22:15:00.000Z");
export const AFTER_PLANNED = new Date("2026-09-30T23:15:00.000Z");

export interface StoredRun {
  outcome: CollectionAutopilotOutcome;
  message: string | null;
}

/** La table, en mémoire — la clé (entité, clôture) départage comme la base. */
export class MemoryRuns extends CollectionAutopilotRuns {
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

export function key(legalEntityId: string, cycleClosesAt: Date): string {
  return `${legalEntityId}@${cycleClosesAt.toISOString()}`;
}

export class FixedAutoEntities extends AutoCollectionEntitiesReader {
  constructor(private readonly entities: readonly AutoCollectionEntity[]) {
    super();
  }
  enabled(): Promise<readonly AutoCollectionEntity[]> {
    return Promise.resolve(this.entities);
  }
}

/** Une constitution scriptée : des lots, ou un refus. */
export class ScriptedConstituter extends AutomaticCollectionConstituter {
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

export const ENTITY: AutoCollectionEntity = {
  legalEntityId: ENTITY_ID,
  name: "Crazeativity",
  autoCollectionDelayHours: 1,
};

/**
 * Ce que l'automatisme lit des clôtures passées : les tentatives viennent de
 * la table en mémoire ; le plancher et le dernier lot sont posés par le test.
 */
export class MemoryCoverage extends AutopilotCoverageReader {
  floorAt: Date | null = null;
  lastLiveBatchClosesAt: Date | null = null;

  constructor(private readonly runs: MemoryRuns) {
    super();
  }
  coverageOf(legalEntityId: string, before: Date): Promise<AutopilotCoverage> {
    const attemptedClosures = [...this.runs.rows.keys()]
      .map((k) => k.split("@"))
      .filter(([id, at]) => id === legalEntityId && at !== undefined)
      .map(([, at]) => new Date(at ?? ""))
      .filter((closure) => closure < before);
    return Promise.resolve({
      floorAt: this.floorAt,
      attemptedClosures,
      lastLiveBatchClosesAt: this.lastLiveBatchClosesAt,
    });
  }
}

export function autopilot(
  constituter: AutomaticCollectionConstituter,
  at: Date = AFTER_PLANNED,
  entities: readonly AutoCollectionEntity[] = [ENTITY],
  rhythms: FixedRhythms = new FixedRhythms(),
) {
  const runs = new MemoryRuns();
  const coverage = new MemoryCoverage(runs);
  const events = new RecordingPublisher();
  const handler = new RunCollectionAutopilotHandler(
    new FixedAutoEntities(entities),
    rhythms,
    runs,
    coverage,
    constituter,
    events,
    new FixedClock(at),
    new DirectUnitOfWork(),
  );
  return { handler, runs, coverage, events };
}
