import { OrderCollectionTransitionError } from "../../errors/collection-errors.js";
import { OrderCollection, type OrderCollectionStateName } from "../order-collection.js";

// L'instant n'est que recopié : jamais comparé à l'horloge.
const AT = new Date("2026-11-20T09:00:00.000Z");
const STAMP = { at: new Date("2026-11-20T10:00:00.000Z"), staffId: "staff_compta" };

function inState(state: OrderCollectionStateName): OrderCollection {
  const engaged = state === "batched" || state === "collected" || state === "returned";
  return OrderCollection.rehydrate({
    orderId: "o1",
    state,
    batchId: engaged ? "lot_1" : null,
    lineRank: engaged ? 1 : null,
    exclusionReason: state === "excluded" ? "no_mandate" : null,
    amountCents: 1_000,
    settledNote: state === "settled_otherwise" ? "chèque" : null,
    settledByStaffId: state === "settled_otherwise" ? "staff_x" : null,
    bankTransferId: state === "settled_by_transfer" ? "01VIR0" : null,
    updatedAt: AT,
  });
}

describe("OrderCollection.settleByTransfer — réglée par un virement reçu (V7)", () => {
  it.each<OrderCollectionStateName>(["due", "excluded"])(
    "une ligne %s passe settled_by_transfer et cite son virement",
    (state) => {
      const collection = inState(state);

      collection.settleByTransfer("01VIR", STAMP);

      expect(collection.toPersistence()).toEqual({
        orderId: "o1",
        state: "settled_by_transfer",
        batchId: null,
        lineRank: null,
        exclusionReason: null,
        amountCents: 1_000,
        settledNote: null,
        settledByStaffId: "staff_compta",
        bankTransferId: "01VIR",
        updatedAt: STAMP.at,
      });
    },
  );

  it.each<OrderCollectionStateName>([
    "batched",
    "collected",
    "returned",
    "written_off",
    "settled_otherwise",
    "cancelled",
    "settled_by_transfer",
  ])("une ligne %s la refuse", (state) => {
    expect(() => inState(state).settleByTransfer("01VIR", STAMP)).toThrow(
      OrderCollectionTransitionError,
    );
  });

  it("réglée par virement, elle n'entre plus dans aucun lot ni ne se règle autrement", () => {
    const collection = inState("settled_by_transfer");

    expect(() => collection.batch("lot_2", 1, AT)).toThrow(OrderCollectionTransitionError);
    expect(() => collection.settleOtherwise("chèque", STAMP)).toThrow(
      OrderCollectionTransitionError,
    );
    expect(collection.alignOnSettlement(400, AT)).toBe(false);
  });
});
