import {
  type OrderTransferStatus,
  TransferStatusReader,
} from "../../../delivery/channels/handover/index.js";

/**
 * Le transfert des commandes, doublé (lot T2) : celles nommées sont portées
 * par un transfert vers « Val Village », dans l'état donné ; les autres ne
 * le sont pas.
 */
export class FixedTransferStatus extends TransferStatusReader {
  constructor(
    private readonly states: ReadonlyMap<string, OrderTransferStatus["state"]> = new Map(),
  ) {
    super();
  }

  statusOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderTransferStatus>> {
    return Promise.resolve(
      new Map(
        orderIds.flatMap((orderId) => {
          const state = this.states.get(orderId);
          return state === undefined
            ? []
            : [
                [
                  orderId,
                  { transferId: "t_1", siteLabel: "Val Village", state, at: new Date(0) },
                ] as const,
              ];
        }),
      ),
    );
  }
}
