import type { DurableFact } from "../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { ProductionHandoffLedger } from "../../domain/ports/production-handoff.ledger.js";
import { ProductionHandoffReader } from "../../domain/ports/production-handoff.reader.js";
import type { ProductionHandoff } from "../../domain/services/production-handoff.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PackingHandoffs } from "../services/packing-handoffs.service.js";

/**
 * Les doublés de la remise au colisage (plan `colisage/plan-domaine-colisage.md`,
 * K1) — chacun ÉTEND son port, donc aucun cast.
 */

/** La boîte d'envoi : elle garde chaque fait, et absorbe une clé déjà écrite, comme la vraie. */
export class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  constructor(private readonly trace: string[] = []) {
    super();
  }

  publish(fact: DurableFact): Promise<void> {
    this.trace.push(`publish:${fact.type}`);
    if (!this.facts.some((known) => known.key === fact.key)) {
      this.facts.push(fact);
    }
    return Promise.resolve();
  }

  /** Les faits d'un type, dans l'ordre d'écriture. */
  of(type: string): readonly DurableFact[] {
    return this.facts.filter((fact) => fact.type === type);
  }
}

/** La table `production_handoff` en mémoire : une ligne par `id`, jamais réécrite. */
export class InMemoryHandoffs extends ProductionHandoffLedger {
  readonly rows = new Map<
    string,
    { readonly serviceDay: string; readonly handoff: ProductionHandoff }
  >();

  record(day: ServiceDay, handoff: ProductionHandoff): Promise<void> {
    if (!this.rows.has(handoff.id)) {
      this.rows.set(handoff.id, { serviceDay: day.value, handoff });
    }
    return Promise.resolve();
  }

  get handoffs(): readonly ProductionHandoff[] {
    return [...this.rows.values()].map((row) => row.handoff);
  }
}

/** La lecture des remises, adossée à la même table en mémoire. */
export class InMemoryHandoffReader extends ProductionHandoffReader {
  constructor(private readonly ledger: InMemoryHandoffs) {
    super();
  }

  handedAmong(day: ServiceDay, batchIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(
      new Set(
        batchIds.filter((id) => {
          const row = this.ledger.rows.get(id);
          return row !== undefined && row.serviceDay === day.value && row.handoff.quantity > 0;
        }),
      ),
    );
  }
}

/** Le service réel, branché sur les trois doublés. */
export function handoffsOnDoubles(trace: string[] = []): {
  readonly service: PackingHandoffs;
  readonly ledger: InMemoryHandoffs;
  readonly durable: RecordingDurable;
} {
  const ledger = new InMemoryHandoffs();
  const durable = new RecordingDurable(trace);
  return {
    service: new PackingHandoffs(ledger, new InMemoryHandoffReader(ledger), durable),
    ledger,
    durable,
  };
}
