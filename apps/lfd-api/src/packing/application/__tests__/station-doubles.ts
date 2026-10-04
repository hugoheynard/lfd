import type { DurableFact } from "../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { PackingSheet, type PackingSheetSnapshot } from "../../domain/entities/packing-sheet.js";
import { PackingStock } from "../../domain/entities/packing-stock.js";
import {
  PackingReturnLedger,
  PackingReturnReader,
  type ReturnToDecide,
} from "../../domain/ports/packing-return.ledger.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import type { InMemoryShadow } from "./shadow-doubles.js";

/**
 * Les doublés du poste réel (K2) — chacun ÉTEND son port. Ils partagent l'état
 * de l'ombre (`InMemoryShadow`) : une remise reçue par l'abonné est une
 * réserve que la mise au bac verrouille, comme en base.
 */

/** La boîte d'envoi : chaque fait, dans l'ordre ; une clé déjà écrite est absorbée. */
export class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    if (!this.facts.some((known) => known.key === fact.key)) {
      this.facts.push(fact);
    }
    return Promise.resolve();
  }

  of(type: string): readonly DurableFact[] {
    return this.facts.filter((fact) => fact.type === type);
  }
}

/** Les bacs en mémoire, rendus entiers ; le « verrou » ne fait que charger. */
export class InMemorySheets extends PackingSheetRepository {
  readonly rows = new Map<string, PackingSheetSnapshot>();

  put(snapshot: PackingSheetSnapshot): void {
    this.rows.set(`${snapshot.serviceDay}/${snapshot.orderId}`, snapshot);
  }

  lock(serviceDay: string, orderId: string): Promise<PackingSheet | null> {
    const row = this.rows.get(`${serviceDay}/${orderId}`);
    return Promise.resolve(row === undefined ? null : PackingSheet.fromSnapshot(row));
  }

  save(sheet: PackingSheet): Promise<void> {
    this.put(sheet.toSnapshot());
    return Promise.resolve();
  }

  of(serviceDay: string, orderId: string): PackingSheetSnapshot | undefined {
    return this.rows.get(`${serviceDay}/${orderId}`);
  }
}

/** La réserve, adossée à celle de l'ombre (reçu, rendu) et à un compte au bac. */
export class InMemoryStocks extends PackingStockRepository {
  private readonly packed = new Map<string, number>();

  constructor(private readonly shadow: InMemoryShadow) {
    super();
  }

  lock(serviceDay: string, sku: string): Promise<PackingStock> {
    const key = `${serviceDay}/${sku}`;
    const held = this.shadow.stocks.get(key) ?? { received: 0, returned: 0 };
    return Promise.resolve(
      PackingStock.fromSnapshot({ serviceDay, sku, ...held, packed: this.packed.get(key) ?? 0 }),
    );
  }

  save(stock: PackingStock): Promise<void> {
    const key = `${stock.serviceDay}/${stock.sku}`;
    const held = this.shadow.stocks.get(key) ?? { received: 0, returned: 0 };
    this.shadow.stocks.set(key, { ...held, returned: stock.returned });
    this.packed.set(key, stock.packed);
    return Promise.resolve();
  }

  packedOf(serviceDay: string, sku: string): number {
    return this.packed.get(`${serviceDay}/${sku}`) ?? 0;
  }
}

/** Les demandes de retour en mémoire : une fois reçue, une fois tranchée. */
export class InMemoryReturns extends PackingReturnLedger {
  readonly rows = new Map<string, { request: ReturnToDecide; returned: number | null }>();

  record(request: ReturnToDecide): Promise<boolean> {
    if (this.rows.has(request.requestId)) {
      return Promise.resolve(false);
    }
    this.rows.set(request.requestId, { request, returned: null });
    return Promise.resolve(true);
  }

  decide(requestId: string, returned: number): Promise<void> {
    const row = this.rows.get(requestId);
    if (row !== undefined && row.returned === null) {
      row.returned = returned;
    }
    return Promise.resolve();
  }
}

/** La lecture des demandes, sur le même état — et les reçus de l'ombre. */
export class InMemoryReturnReader extends PackingReturnReader {
  constructor(
    private readonly returns: InMemoryReturns,
    private readonly shadow: InMemoryShadow,
  ) {
    super();
  }

  isHandoffReceived(handoffId: string): Promise<boolean> {
    return Promise.resolve(this.shadow.receipts.get(handoffId)?.kind === "handoff");
  }

  pendingFor(handoffId: string): Promise<readonly ReturnToDecide[]> {
    return Promise.resolve(
      [...this.returns.rows.values()]
        .filter((row) => row.returned === null && row.request.handoffId === handoffId)
        .map((row) => row.request),
    );
  }
}
