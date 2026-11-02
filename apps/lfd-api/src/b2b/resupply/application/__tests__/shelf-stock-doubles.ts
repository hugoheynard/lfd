import { type ShelfDraw, ShelfDrawsReader } from "../../domain/shelf-draws.reader.js";
import { ShelfStockLock } from "../../domain/shelf-stock-lock.js";

/** Le verrou du stock, qui note chaque prise (« jour:point ») au lieu d'attendre. */
export class RecordingShelfStockLock extends ShelfStockLock {
  readonly taken: string[] = [];

  lock(serviceDay: string, siteId: string): Promise<void> {
    this.taken.push(`${serviceDay}:${siteId}`);
    return Promise.resolve();
  }
}

/** Les prélèvements posés à la main, par « jour:point ». */
export class FixedShelfDraws extends ShelfDrawsReader {
  readonly draws = new Map<string, readonly ShelfDraw[]>();

  set(serviceDay: string, siteId: string, draws: readonly ShelfDraw[]): void {
    this.draws.set(`${serviceDay}:${siteId}`, draws);
  }

  /** Combien de fois les prélèvements ont été lus (les prélèvements lus une fois, M3). */
  reads = 0;

  drawsAt(serviceDay: string, siteId: string): Promise<readonly ShelfDraw[]> {
    this.reads += 1;
    return Promise.resolve(this.draws.get(`${serviceDay}:${siteId}`) ?? []);
  }
}
