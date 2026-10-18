import { CatalogReemissionJob } from "../../domain/entities/catalog-reemission-job.js";
import type { CatalogReemissionJobSnapshot } from "../../domain/entities/catalog-reemission-job.js";
import { ReemissionJobReader } from "../../domain/ports/reemission-job.reader.js";
import { ReemissionJobRepository } from "../../domain/ports/reemission-job.repository.js";

/**
 * Les réémissions en mémoire — les deux ports sur la même table, comme
 * l'adaptateur. Chaque `save` est noté : l'ordre des écritures est ce que
 * l'écran voit avancer.
 */
export class InMemoryReemissionJobs extends ReemissionJobRepository {
  readonly rows = new Map<string, CatalogReemissionJobSnapshot>();
  readonly saves: CatalogReemissionJobSnapshot[] = [];

  save(job: CatalogReemissionJob): Promise<void> {
    const snapshot = job.snapshot();
    this.rows.set(snapshot.id, snapshot);
    this.saves.push(snapshot);
    return Promise.resolve();
  }

  runningEverything(): Promise<CatalogReemissionJob | null> {
    const row = [...this.rows.values()].find(
      (candidate) => candidate.status === "running" && candidate.scope === "all",
    );
    return Promise.resolve(row === undefined ? null : CatalogReemissionJob.restore(row));
  }

  running(): Promise<CatalogReemissionJob[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.status === "running")
        .map((row) => CatalogReemissionJob.restore(row)),
    );
  }

  /** Le dernier état rangé d'un travail. */
  stateOf(id: string): CatalogReemissionJobSnapshot | undefined {
    return this.rows.get(id);
  }
}

/** La lecture, sur la même table que {@link InMemoryReemissionJobs}. */
export class InMemoryReemissionReader extends ReemissionJobReader {
  constructor(private readonly jobs: InMemoryReemissionJobs) {
    super();
  }

  latest(): Promise<CatalogReemissionJobSnapshot | null> {
    const rows = [...this.jobs.rows.values()].sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id.localeCompare(a.id),
    );
    return Promise.resolve(rows[0] ?? null);
  }

  byId(id: string): Promise<CatalogReemissionJobSnapshot | null> {
    return Promise.resolve(this.jobs.rows.get(id) ?? null);
  }
}
