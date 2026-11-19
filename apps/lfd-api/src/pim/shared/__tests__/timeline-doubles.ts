import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { CatalogEmitter } from "../catalog-emitter.js";
import { CatalogReemission, type ReemissionReport } from "../catalog-reemission.js";

/**
 * **Où** un geste émet (2a3, C4) : ces doubles inscrivent sur une même ligne
 * de temps l'ouverture et la validation de la transaction, les émissions et
 * les réémissions — la suite lit ensuite l'ordre.
 */

export class Timeline {
  readonly events: string[] = [];
}

export class TimelineUnitOfWork extends UnitOfWork {
  constructor(private readonly timeline: Timeline) {
    super();
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.timeline.events.push("begin");
    const result = await work();
    this.timeline.events.push("commit");
    return result;
  }
}

export class TimelineEmitter extends CatalogEmitter {
  constructor(private readonly timeline: Timeline) {
    super();
  }
  emitProducts(ids: readonly string[]): Promise<void> {
    this.timeline.events.push(`emit:product:${ids.join(",")}`);
    return Promise.resolve();
  }
  emitCategories(ids: readonly string[]): Promise<void> {
    this.timeline.events.push(`emit:category:${ids.join(",")}`);
    return Promise.resolve();
  }
}

export class TimelineReemission extends CatalogReemission {
  constructor(private readonly timeline: Timeline) {
    super();
  }
  productsOfCategories(ids: readonly string[]): Promise<void> {
    this.timeline.events.push(`reemit:family:${ids.join(",")}`);
    return Promise.resolve();
  }
  everything(): Promise<ReemissionReport> {
    this.timeline.events.push("reemit:everything");
    return Promise.resolve({ categories: 0, products: 0, failedProducts: [] });
  }
}
