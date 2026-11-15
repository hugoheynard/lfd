import { DayResuppliesReader, type PlacedResupply } from "../day-resupplies.reader.js";
import type { ServiceDay } from "../../../day/index.js";

/** Les réassorts du commerce, posés par le test ; `trace` reçoit chaque lecture. */
export class DayResupplies extends DayResuppliesReader {
  /** Les « au plus tôt » envoyés (R4a), que le test pose ; un annulé s'en retire. */
  asap: PlacedResupply[] = [];

  constructor(
    public current: readonly PlacedResupply[] = [],
    private readonly trace: string[] = [],
  ) {
    super();
  }

  placedFor(day: ServiceDay): Promise<readonly PlacedResupply[]> {
    this.trace.push(`resupplies:${day.value}`);
    return Promise.resolve(this.current);
  }

  asapToLaunch(day: ServiceDay, resupplyId: string): Promise<PlacedResupply | null> {
    this.trace.push(`asap:${day.value}:${resupplyId}`);
    return Promise.resolve(this.asap.find((r) => r.resupplyId === resupplyId) ?? null);
  }
}
