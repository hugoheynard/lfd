import { type ShelfDraw, ShelfDrawsReader } from "../../domain/shelf-draws.reader.js";
import { ShelfStockLock } from "../../domain/shelf-stock-lock.js";

/** Le verrou du stock, qui note chaque prise (« jour:point ») au lieu d'attendre. */
export class RecordingShelfStockLock extends ShelfStockLock {
  readonly taken: string[] = [];

  /**
   * Un geste d'un autre poste, joué pendant que celui-ci attend le verrou —
   * ce qu'il a lu AVANT est alors périmé. Consommé à son premier usage.
   */
  whileWaiting: (() => Promise<unknown>) | null = null;

  async lock(serviceDay: string, siteId: string): Promise<void> {
    const other = this.whileWaiting;
    this.whileWaiting = null;
    if (other !== null) {
      await other();
    }
    this.taken.push(`${serviceDay}:${siteId}`);
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

  drawsOn(serviceDay: string): Promise<ReadonlyMap<string, readonly ShelfDraw[]>> {
    this.reads += 1;
    const prefix = `${serviceDay}:`;
    return Promise.resolve(
      new Map(
        [...this.draws]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, draws]) => [key.slice(prefix.length), draws]),
      ),
    );
  }
}
