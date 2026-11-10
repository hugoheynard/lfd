import { OrderCollection, type OrderCollectionStateName } from "../order-collection.js";

/**
 * La ligne d'encaissement suit le SOLDE de sa commande (plan E6c2, § 4
 * BLOQUANT 5) : née sur le total commandé, une ligne `due` ou `excluded`
 * prend le montant facturable ; toute autre garde le sien, sans refus. L'instant n'est que
 * recopié.
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

describe("OrderCollection.alignOnSettlement", () => {
  it.each<OrderCollectionStateName>(["due", "excluded"])(
    "une ligne %s prend le montant facturable",
    (state) => {
      const collection = inState(state);

      expect(collection.alignOnSettlement(400, LATER)).toBe(true);
      expect(collection.toPersistence()).toMatchObject({
        state,
        amountCents: 400,
        updatedAt: LATER,
      });
    },
  );

  it("une ligne excluded recalée entre ensuite au lot AVEC le montant facturable", () => {
    const collection = inState("excluded");
    collection.alignOnSettlement(400, LATER);

    collection.batch("lot_2", 3, LATER);

    expect(collection.toPersistence()).toMatchObject({ state: "batched", amountCents: 400 });
  });

  it("au même montant, rien ne change — pas même l'instant", () => {
    const collection = inState("due");

    expect(collection.alignOnSettlement(1_000, LATER)).toBe(false);
    expect(collection.toPersistence().updatedAt).toBe(AT);
  });

  it.each<OrderCollectionStateName>([
    "batched",
    "collected",
    "returned",
    "written_off",
    "settled_otherwise",
    "cancelled",
  ])("une ligne %s garde son montant, sans refus", (state) => {
    const collection = inState(state);

    expect(collection.alignOnSettlement(400, LATER)).toBe(false);
    expect(collection.toPersistence().amountCents).toBe(1_000);
  });
});
