import { DayOrdersReader, type ProducibleOrder } from "../day-orders.reader.js";
import { PendingSettlementSweeper } from "../pending-settlement.sweeper.js";
import type { ServiceDay } from "../../../day/index.js";

/** Les commandes producibles du commerce, posées par le test ; `trace` reçoit chaque lecture. */
export class FixedDayOrders extends DayOrdersReader {
  constructor(
    private readonly rows: readonly ProducibleOrder[] = [],
    private readonly trace: string[] = [],
  ) {
    super();
  }

  producibleFor(day: ServiceDay): Promise<readonly ProducibleOrder[]> {
    this.trace.push(`orders:${day.value}`);
    return Promise.resolve(this.rows);
  }
}

/** Un balayage qui ne fait rien d'autre que se noter dans `trace`. */
export class SilentSweeper extends PendingSettlementSweeper {
  constructor(private readonly trace: string[] = []) {
    super();
  }

  sweep(day: ServiceDay): Promise<void> {
    this.trace.push(`sweep:${day.value}`);
    return Promise.resolve();
  }
}
