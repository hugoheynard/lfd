import type { DurableFact } from "../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { PackingSheet, type PackingSheetSnapshot } from "../../domain/entities/packing-sheet.js";
import { PackingStock, type PackingStockSnapshot } from "../../domain/entities/packing-stock.js";
import { PackingDayStocksReader } from "../../domain/ports/packing-day-stocks.reader.js";
import type { StockReservationSnapshot } from "../../domain/services/stock-reservations.js";
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

  lockLatestOf(orderId: string): Promise<PackingSheet | null> {
    const latest = [...this.rows.values()]
      .filter((row) => row.orderId === orderId)
      .sort((a, b) => b.serviceDay.localeCompare(a.serviceDay))[0];
    return Promise.resolve(latest === undefined ? null : PackingSheet.fromSnapshot(latest));
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
  /**
   * Les réservations (R4b), telles que l'adaptateur les relit : leur emballé
   * suit l'agrégat, comme la ligne de la fiche s'écrit sous le même verrou.
   */
  readonly reservations = new Map<string, readonly StockReservationSnapshot[]>();

  constructor(private readonly shadow: InMemoryShadow) {
    super();
  }

  lock(serviceDay: string, sku: string): Promise<PackingStock> {
    const key = `${serviceDay}/${sku}`;
    const held = this.shadow.stocks.get(key) ?? { received: 0, returned: 0 };
    return Promise.resolve(
      PackingStock.fromSnapshot({
        serviceDay,
        sku,
        ...held,
        packed: this.packed.get(key) ?? 0,
        reservations: this.reservations.get(key) ?? [],
      }),
    );
  }

  save(stock: PackingStock): Promise<void> {
    const key = `${stock.serviceDay}/${stock.sku}`;
    const held = this.shadow.stocks.get(key) ?? { received: 0, returned: 0 };
    this.shadow.stocks.set(key, { ...held, returned: stock.returned });
    this.packed.set(key, stock.packed);
    this.reservations.set(key, stock.reservations);
    return Promise.resolve();
  }

  packedOf(serviceDay: string, sku: string): number {
    return this.packed.get(`${serviceDay}/${sku}`) ?? 0;
  }

  /** Les réserves d'une journée, telles que `lock` les rendrait — sans verrou. */
  async snapshotsOn(serviceDay: string): Promise<readonly PackingStockSnapshot[]> {
    const keys = new Set([...this.shadow.stocks.keys(), ...this.packed.keys()]);
    const skus = [...keys]
      .filter((key) => key.startsWith(`${serviceDay}/`))
      .map((key) => key.slice(serviceDay.length + 1));
    const stocks = await Promise.all(skus.map((sku) => this.lock(serviceDay, sku)));
    return stocks.map((stock) => stock.toSnapshot());
  }
}

/** La lecture des réserves du jour (R4b), adossée au dépôt en mémoire. */
export class InMemoryDayStocks extends PackingDayStocksReader {
  constructor(private readonly stocks: InMemoryStocks) {
    super();
  }

  on(serviceDay: string): Promise<readonly PackingStockSnapshot[]> {
    return this.stocks.snapshotsOn(serviceDay);
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
