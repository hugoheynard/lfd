import {
  type BroughtBackOrderRow,
  BroughtBackOrdersReader,
} from "../../../domain/ports/brought-back-orders.reader.js";

/**
 * Les commandes rapportées, figées (lot RL1) : `rows` sont celles qui restent
 * à replacer ; `lastAmong` les relit toutes, replacées ou non.
 */
export class FixedBroughtBackOrders extends BroughtBackOrdersReader {
  constructor(
    private readonly rows: readonly BroughtBackOrderRow[] = [],
    private readonly replaced: readonly BroughtBackOrderRow[] = [],
  ) {
    super();
  }

  awaitingPlacement(): Promise<readonly BroughtBackOrderRow[]> {
    return Promise.resolve(this.rows);
  }

  lastAmong(orderIds: readonly string[]): Promise<ReadonlyMap<string, Date>> {
    return Promise.resolve(
      new Map(
        [...this.rows, ...this.replaced]
          .filter((row) => orderIds.includes(row.orderId))
          .map((row) => [row.orderId, row.broughtBackAt]),
      ),
    );
  }
}
