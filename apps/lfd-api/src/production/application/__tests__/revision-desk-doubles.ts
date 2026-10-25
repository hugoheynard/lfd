import { ProductionDay } from "../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";

/**
 * La journée, en mémoire, telle que la révision après l'arrêt la relit et
 * l'écrit (plan A2) : `load` rend la dernière écrite (une copie, comme la
 * base), `save` la remplace. `trace` reçoit les deux, pour éprouver l'ordre
 * avec le verrou.
 */
export class SavedDays extends ProductionDayRepository {
  saved = 0;

  constructor(
    private current: ProductionDay,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  load(): Promise<ProductionDay> {
    this.trace.push("load");
    return Promise.resolve(ProductionDay.fromSnapshot(this.current.toSnapshot()));
  }

  save(day: ProductionDay): Promise<void> {
    this.trace.push("save");
    this.saved += 1;
    this.current = ProductionDay.fromSnapshot(day.toSnapshot());
    return Promise.resolve();
  }

  /** La journée telle qu'elle est écrite maintenant. */
  get day(): ProductionDay {
    return this.current;
  }
}
