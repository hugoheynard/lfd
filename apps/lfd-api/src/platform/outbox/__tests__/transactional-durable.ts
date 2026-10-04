import { UnitOfWork } from "../../database/unit-of-work.js";
import type { DurableFact } from "../durable-event.js";
import { DurablePublisher } from "../durable-publisher.js";

/**
 * Une unité de travail qui VALIDE ou ANNULE les faits durables écrits en son
 * sein — ce que la vraie transaction fait de la ligne de la boîte d'envoi.
 * Imbriquée, elle rejoint l'unité ouverte, comme `PrismaUnitOfWork`.
 */
export class TransactionalUnitOfWork extends UnitOfWork {
  /** Les faits validés, dans l'ordre d'écriture. */
  readonly committed: DurableFact[] = [];
  private pending: DurableFact[] | null = null;

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.pending !== null) {
      return work();
    }
    this.pending = [];
    try {
      const result = await work();
      this.committed.push(...this.pending);
      return result;
    } finally {
      this.pending = null;
    }
  }

  /** Vrai pendant une unité de travail. */
  get isOpen(): boolean {
    return this.pending !== null;
  }

  /** Écrit un fait dans l'unité ouverte ; refuse hors unité, comme le vrai port. */
  write(fact: DurableFact): void {
    if (this.pending === null) {
      throw new RangeError(`fait durable « ${fact.type} » hors unité de travail`);
    }
    if (![...this.committed, ...this.pending].some((known) => known.key === fact.key)) {
      this.pending.push(fact);
    }
  }

  /** Les faits validés d'un type. */
  of(type: string): readonly DurableFact[] {
    return this.committed.filter((fact) => fact.type === type);
  }
}

/** La boîte d'envoi doublée : elle écrit dans l'unité de travail doublée. */
export class TransactionalDurablePublisher extends DurablePublisher {
  constructor(private readonly uow: TransactionalUnitOfWork) {
    super();
  }

  publish(fact: DurableFact): Promise<void> {
    try {
      this.uow.write(fact);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new RangeError(String(error)));
    }
  }
}
