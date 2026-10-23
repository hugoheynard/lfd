import { OrderCollectionTransitionError } from "../../errors/collection-errors.js";
import { OrderCollection, type OrderCollectionStateName } from "../order-collection.js";

/**
 * La ligne d'encaissement d'une commande au compte MODIFIÉE (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M1) : elle prend le
 * nouveau total tant qu'elle n'est pas engagée, et refuse sinon. L'instant
 * n'est que recopié.
 */

const AT = new Date("2026-10-23T09:00:00.000Z");
const LATER = new Date("2026-10-23T10:00:00.000Z");

function inState(state: OrderCollectionStateName): OrderCollection {
  const engaged = state === "batched" || state === "collected" || state === "returned";
  return OrderCollection.rehydrate({
    orderId: "o1",
    state,
    batchId: engaged ? "lot_1" : null,
    lineRank: engaged ? 1 : null,
    exclusionReason: state === "excluded" ? "no_mandate" : null,
    amountCents: 1_000,
    settledNote: null,
    settledByStaffId: null,
    updatedAt: AT,
  });
}

describe("OrderCollection.revalue", () => {
  it.each<OrderCollectionStateName>(["due", "excluded"])(
    "une ligne %s prend le nouveau montant et garde son état",
    (state) => {
      const collection = inState(state);

      collection.revalue(1_450, LATER);

      expect(collection.toPersistence()).toMatchObject({
        state,
        amountCents: 1_450,
        updatedAt: LATER,
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
  ])("une ligne %s ne se réévalue pas", (state) => {
    expect(() => inState(state).revalue(1_450, LATER)).toThrow(OrderCollectionTransitionError);
  });
});
