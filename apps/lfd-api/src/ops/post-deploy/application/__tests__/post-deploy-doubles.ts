import {
  PostDeployOperation,
  type OperationReport,
  type PostDeployApplication,
} from "../../../../platform/post-deploy/post-deploy-operation.js";
import { DeployedRevision } from "../../domain/deployed-revision.js";
import {
  PostDeployAlreadyRunningError,
  PostDeployRunChangedError,
} from "../../domain/post-deploy-errors.js";
import { PostDeployRun, type PostDeployRunSnapshot } from "../../domain/post-deploy-run.js";
import { PostDeployRunReader } from "../../domain/post-deploy-run.reader.js";
import { PostDeployRunRepository } from "../../domain/post-deploy-run.repository.js";

/** Les passages en mémoire, avec les deux gardes de l'adaptateur Prisma. */
export class InMemoryPostDeployRuns extends PostDeployRunRepository {
  readonly rows = new Map<string, PostDeployRunSnapshot>();

  load(id: string): Promise<PostDeployRun | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : PostDeployRun.rehydrate(row));
  }

  latestSimulationBy(operationKey: string, actor: string): Promise<PostDeployRun | null> {
    const mine = [...this.rows.values()].filter(
      (row) => row.operationKey === operationKey && row.simulatedBy === actor,
    );
    const latest = mine.at(-1);
    return Promise.resolve(latest === undefined ? null : PostDeployRun.rehydrate(latest));
  }

  running(): Promise<readonly PostDeployRun[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.state === "running")
        .map((row) => PostDeployRun.rehydrate(row)),
    );
  }

  save(run: PostDeployRun): Promise<void> {
    const next = run.snapshot();
    const stored = this.rows.get(next.id);
    if (run.persistedState !== null && stored?.state !== run.persistedState) {
      return Promise.reject(new PostDeployRunChangedError(next.id));
    }
    const otherRunning = [...this.rows.values()].some(
      (row) =>
        row.id !== next.id && row.operationKey === next.operationKey && row.state === "running",
    );
    if (next.state === "running" && otherRunning) {
      return Promise.reject(new PostDeployAlreadyRunningError(next.operationKey));
    }
    this.rows.set(next.id, next);
    return Promise.resolve();
  }
}

/** La lecture, sur les mêmes lignes. */
export class InMemoryPostDeployRunReader extends PostDeployRunReader {
  constructor(private readonly runs: InMemoryPostDeployRuns) {
    super();
  }

  latestOf(keys: readonly string[]): Promise<ReadonlyMap<string, PostDeployRunSnapshot>> {
    const latest = new Map<string, PostDeployRunSnapshot>();
    for (const row of this.runs.rows.values()) {
      if (keys.includes(row.operationKey)) {
        latest.set(row.operationKey, row);
      }
    }
    return Promise.resolve(latest);
  }

  byId(id: string): Promise<PostDeployRunSnapshot | null> {
    return Promise.resolve(this.runs.rows.get(id) ?? null);
  }
}

export class FixedRevision extends DeployedRevision {
  constructor(public value = "rev-a") {
    super();
  }

  current(): string {
    return this.value;
  }
}

/** Un rapport de `writable` décisions. */
export function reportOf(writable: number, byHand = 0): OperationReport {
  return { writable, byHand, summary: [`${String(writable)} à écrire`], sample: [] };
}

/**
 * Une opération scriptée : sa simulation rend `pending` ; son application
 * avance en `batches` lots, enregistre ses auteurs, puis met `pending` à zéro
 * — ou lève `failure`.
 */
export class ScriptedOperation extends PostDeployOperation {
  readonly title: string;
  readonly why = "Pour le test.";
  readonly limit = "Sans retour arrière.";
  readonly actors: string[] = [];
  simulations = 0;
  failure: Error | null = null;

  constructor(
    readonly key: string,
    public pending: number,
    readonly after: readonly string[] = [],
    private readonly batches = 2,
  ) {
    super();
    this.title = `Opération ${key}`;
  }

  simulate(): Promise<OperationReport> {
    this.simulations += 1;
    return Promise.resolve(reportOf(this.pending));
  }

  async apply(run: PostDeployApplication): Promise<OperationReport> {
    this.actors.push(run.actor);
    for (let batch = 1; batch <= this.batches; batch += 1) {
      await run.progress(reportOf(batch));
    }
    if (this.failure !== null) {
      throw this.failure;
    }
    const done = reportOf(this.pending);
    this.pending = 0;
    return done;
  }
}
