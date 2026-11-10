import { OrderCollectionTransitionError } from "../../errors/collection-errors.js";
import { OrderCollection, type OrderCollectionStateName } from "../order-collection.js";

/**
 * La ligne d'encaissement FERMÉE par l'annulation d'une commande au compte
 * (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.4) : `cancelled` est
 * terminal — aucune transition ne l'accepte. L'instant n'est que recopié.
 */

const AT = new Date("2026-10-02T09:00:00.000Z");
const STAMP = { at: AT, staffId: "staff_1" };

function inState(state: OrderCollectionStateName): OrderCollection {
  return OrderCollection.rehydrate({
    orderId: "o1",
    state,
    batchId: state === "batched" || state === "collected" || state === "returned" ? "lot_1" : null,
    lineRank: state === "batched" || state === "collected" || state === "returned" ? 1 : null,
    exclusionReason: state === "excluded" ? "no_mandate" : null,
    amountCents: 1_000,
    settledNote: null,
    settledByStaffId: null,
    updatedAt: AT,
  });
}

function closed(): OrderCollection {
  return OrderCollection.closedAtCancellation("o1", 1_000, AT);
}

describe("OrderCollection.close — fermer la ligne d'une commande annulée", () => {
  it.each(["due", "excluded"] as const)("depuis %s : cancelled, sans lot ni raison", (from) => {
    const order = inState(from);

    order.close(AT);

    expect(order.toPersistence()).toMatchObject({
      state: "cancelled",
      batchId: null,
      lineRank: null,
      exclusionReason: null,
      amountCents: 1_000,
    });
  });

  it.each([
    "batched",
    "collected",
    "returned",
    "written_off",
    "settled_otherwise",
    "cancelled",
  ] as const)("refusée depuis %s : une ligne engagée ne se ferme pas", (from) => {
    expect(() => inState(from).close(AT)).toThrow(OrderCollectionTransitionError);
  });

  it("une commande qu'aucun lot n'a vue naît fermée", () => {
    expect(closed().toPersistence()).toMatchObject({
      orderId: "o1",
      state: "cancelled",
      amountCents: 1_000,
      updatedAt: AT,
    });
  });
});

describe("`cancelled` est terminal : chaque transition la refuse", () => {
  it.each<[string, (order: OrderCollection) => void]>([
    ["batch", (order) => order.batch("lot_2", 1, AT)],
    ["exclude", (order) => order.exclude("no_mandate", AT)],
    ["release", (order) => order.release(AT)],
    ["collect", (order) => order.collect(AT)],
    ["bounce", (order) => order.bounce(AT)],
    ["represent", (order) => order.represent(AT)],
    ["writeOff", (order) => order.writeOff(AT)],
    ["settleReturned", (order) => order.settleReturned("virement", STAMP)],
    ["settleOtherwise", (order) => order.settleOtherwise("virement", STAMP)],
  ])("%s refuse une ligne fermée", (_, gesture) => {
    const order = closed();

    expect(() => gesture(order)).toThrow(OrderCollectionTransitionError);
    expect(order.stateName).toBe("cancelled");
  });
});
