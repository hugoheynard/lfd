import type { DurableFact } from "../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { ProductionHandoffLedger } from "../../domain/ports/production-handoff.ledger.js";
import { ProductionHandoffReader } from "../../domain/ports/production-handoff.reader.js";
import {
  type AnsweredReturn,
  ProductionReturnRequests,
  type ReturnRequest,
} from "../../domain/ports/production-return.requests.js";
import { FixedIdGenerator } from "../../../platform/id/fixed-id-generator.js";
import type { ProductionHandoff } from "../../domain/services/production-handoff.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PackingHandoffs } from "../services/packing-handoffs.service.js";

/**
 * Les doublés de la remise au colisage (plan `colisage/colisage.md`,
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

/** La table `production_return_request` en mémoire : une réponse, une fois. */
export class InMemoryReturnRequests extends ProductionReturnRequests {
  readonly rows = new Map<
    string,
    {
      readonly serviceDay: string;
      readonly request: ReturnRequest;
      answer: { readonly returned: number; readonly at: Date } | null;
    }
  >();

  request(day: ServiceDay, request: ReturnRequest): Promise<void> {
    this.rows.set(request.requestId, { serviceDay: day.value, request, answer: null });
    return Promise.resolve();
  }

  answer(requestId: string, returned: number, answeredAt: Date): Promise<AnsweredReturn | null> {
    const row = this.rows.get(requestId);
    if (row === undefined || row.answer !== null) {
      return Promise.resolve(null);
    }
    row.answer = { returned, at: answeredAt };
    return Promise.resolve({
      serviceDay: row.serviceDay,
      batchId: row.request.batchId,
      sku: row.request.sku,
      quantity: row.request.quantity,
      returned,
      requested: row.request.requested,
    });
  }
}

/** Ce que les demandes disent d'une fournée — le pendant de `returnsByBatch`. */
export function returnCountsOf(
  requests: InMemoryReturnRequests,
): (batchId: string) => { readonly returned: number; readonly pendingReturn: number } {
  return (batchId) => {
    let returned = 0;
    let pendingReturn = 0;
    for (const row of requests.rows.values()) {
      if (row.request.batchId !== batchId) {
        continue;
      }
      if (row.answer === null) {
        pendingReturn += row.request.quantity;
      } else {
        returned += row.answer.returned;
      }
    }
    return { returned, pendingReturn };
  };
}

/** Le service réel, branché sur les doublés. */
export function handoffsOnDoubles(trace: string[] = []): {
  readonly service: PackingHandoffs;
  readonly ledger: InMemoryHandoffs;
  readonly durable: RecordingDurable;
  readonly requests: InMemoryReturnRequests;
} {
  const ledger = new InMemoryHandoffs();
  const durable = new RecordingDurable(trace);
  const requests = new InMemoryReturnRequests();
  return {
    service: new PackingHandoffs(
      ledger,
      new InMemoryHandoffReader(ledger),
      durable,
      requests,
      new FixedIdGenerator("ask"),
    ),
    ledger,
    durable,
    requests,
  };
}
