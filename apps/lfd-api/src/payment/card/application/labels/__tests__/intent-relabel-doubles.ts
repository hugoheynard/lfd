import { IntentRelabel } from "../../../domain/entities/intent-relabel.js";
import { IntentRelabelQueue } from "../../../domain/ports/intent-relabel-queue.reader.js";
import { IntentRelabelRepository } from "../../../domain/ports/intent-relabel.repository.js";

/**
 * Les libellés en mémoire — la même condition que la base : une écriture ne
 * passe que si la révision lue est encore celle gardée.
 */
export class InMemoryIntentRelabels extends IntentRelabelRepository {
  readonly rows = new Map<string, IntentRelabel>();

  load(paymentId: string): Promise<IntentRelabel | null> {
    const row = this.rows.get(paymentId);
    return Promise.resolve(row === undefined ? null : IntentRelabel.rehydrate(row.toSnapshot()));
  }

  save(relabel: IntentRelabel): Promise<boolean> {
    const current = this.rows.get(relabel.paymentId);
    const expected = relabel.loadedRevision;
    if ((expected === null) !== (current === undefined)) {
      return Promise.resolve(false);
    }
    if (current !== undefined && current.revision !== expected) {
      return Promise.resolve(false);
    }
    this.rows.set(relabel.paymentId, IntentRelabel.rehydrate(relabel.toSnapshot()));
    return Promise.resolve(true);
  }

  state(paymentId: string): string | undefined {
    return this.rows.get(paymentId)?.toSnapshot().state;
  }
}

/** La file, lue sur les mêmes lignes. */
export class InMemoryIntentRelabelQueue extends IntentRelabelQueue {
  constructor(private readonly relabels: InMemoryIntentRelabels) {
    super();
  }

  due(at: Date, limit: number): Promise<readonly string[]> {
    return Promise.resolve(
      [...this.relabels.rows.values()]
        .filter((row) => row.isDueAt(at))
        .map((row) => row.paymentId)
        .slice(0, limit),
    );
  }
}
