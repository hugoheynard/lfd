import {
  ProductionDay,
  type PackedMark,
  type ProductionBatchSnapshot,
} from "../../domain/entities/production-day.js";
import {
  ProductionBatchRepository,
  type RecordedBatch,
} from "../../domain/ports/production-batch.repository.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Les doublés des fournées et du verrou — chacun ÉTEND son port, donc aucun
 * cast. Partagés par les specs de handlers qui écrivent une fournée ou
 * prennent le verrou de la journée.
 *
 * `trace` est un fil commun que plusieurs doublés peuvent remplir : c'est ce
 * qui prouve un ORDRE (« le verrou avant la relecture »), qu'aucun doublé seul
 * ne voit.
 */

/** Rendu et en attente, pour une fournée (K2). */
export interface BatchReturnCounts {
  readonly returned: number;
  readonly pendingReturn: number;
}

function noReturns(): BatchReturnCounts {
  return { returned: 0, pendingReturn: 0 };
}

/** Le verrou : il note qu'il a été pris, pour quelle journée. */
export class RecordingDayLock extends ProductionDayLock {
  constructor(private readonly trace: string[] = []) {
    super();
  }

  lock(day: ServiceDay): Promise<void> {
    this.trace.push(`lock:${day.value}`);
    return Promise.resolve();
  }

  get taken(): readonly string[] {
    return this.trace.filter((entry) => entry.startsWith("lock:"));
  }
}

/**
 * Une table `production_batch` en mémoire, avec la sémantique de la vraie :
 * `record` n'écrit que si l'`id` est libre, puis rend ce qu'elle porte sous
 * cet `id` ; `cancel` ne trace que la première annulation.
 */
export class InMemoryBatches extends ProductionBatchRepository {
  readonly rows = new Map<string, RecordedBatch>();
  readonly writes: string[] = [];

  constructor(private readonly trace: string[] = []) {
    super();
  }

  record(day: ServiceDay, batch: ProductionBatchSnapshot): Promise<RecordedBatch> {
    this.trace.push(`record:${batch.id}`);
    if (!this.rows.has(batch.id)) {
      this.rows.set(batch.id, { serviceDay: day.value, batch });
      this.writes.push(batch.id);
    }
    const stored = this.rows.get(batch.id);
    return stored === undefined
      ? Promise.reject(new Error(`fournée ${batch.id} introuvable après écriture`))
      : Promise.resolve(stored);
  }

  cancel(day: ServiceDay, id: string, mark: PackedMark): Promise<void> {
    this.trace.push(`cancel:${id}`);
    const stored = this.rows.get(id);
    if (
      stored !== undefined &&
      stored.serviceDay === day.value &&
      stored.batch.cancelled === null
    ) {
      this.rows.set(id, { ...stored, batch: { ...stored.batch, cancelled: mark } });
    }
    return Promise.resolve();
  }

  /** Les fournées écrites, sans leur journée — ce que la plupart des tests comparent. */
  get batches(): readonly ProductionBatchSnapshot[] {
    return [...this.rows.values()].map((entry) => entry.batch);
  }
}

/**
 * Le dépôt de la journée, **adossé à la table des fournées en mémoire** :
 * chaque `load` rend la journée de départ avec les fournées écrites jusque-là,
 * comme la vraie base. `stale` fige la lecture — deux postes qui ont chargé
 * AVANT que l'un écrive, c'est-à-dire la course.
 */
export class BatchBackedDays extends ProductionDayRepository {
  saved = 0;
  stale = false;

  /**
   * @param returnsOf ce que les demandes de retour disent d'une fournée (K2) —
   *   le pendant de `returnsByBatch` côté adaptateur. Aucune par défaut.
   */
  constructor(
    private readonly base: ProductionDay,
    private readonly store: InMemoryBatches,
    private readonly trace: string[] = [],
    private readonly returnsOf: (batchId: string) => BatchReturnCounts = noReturns,
  ) {
    super();
  }

  load(): Promise<ProductionDay> {
    this.trace.push("load");
    const snapshot = this.base.toSnapshot();
    const written = this.store.batches.map((batch) => ({ ...batch, ...this.returnsOf(batch.id) }));
    return Promise.resolve(
      ProductionDay.fromSnapshot({
        ...snapshot,
        batches: this.stale ? snapshot.batches : [...snapshot.batches, ...written],
      }),
    );
  }

  save(): Promise<void> {
    this.saved += 1;
    return Promise.resolve();
  }
}
