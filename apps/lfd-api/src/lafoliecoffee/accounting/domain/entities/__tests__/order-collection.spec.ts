import {
  OrderCollectionTransitionError,
  SettlementNoteRequiredError,
} from "../../errors/collection-errors.js";
import { OrderCollection } from "../order-collection.js";

const AT = new Date("2026-10-02T09:00:00.000Z");
const STAMP = { at: AT, staffId: "staff_1" };

describe("l'état d'encaissement d'une commande", () => {
  it("suit le diagramme : due → batched → due (lot annulé) → batched → collected", () => {
    const order = OrderCollection.due("o1", 1_000, AT);

    order.batch("lot_1", 1, AT);
    order.release(AT);
    order.batch("lot_2", 3, AT);
    order.collect(AT);

    expect(order.toPersistence()).toMatchObject({
      state: "collected",
      batchId: "lot_2",
      lineRank: 3,
    });
  });

  it("une exclusion se reprend au lot suivant quand sa raison a disparu", () => {
    const order = OrderCollection.due("o1", 1_000, AT);

    order.exclude("payer_detached", AT);
    order.batch("lot_2", 1, AT);

    expect(order.toPersistence()).toMatchObject({ state: "batched", exclusionReason: null });
  });

  it("réglée autrement depuis due ou excluded, avec une note", () => {
    const order = OrderCollection.due("o1", 1_000, AT);
    order.exclude("no_mandate", AT);

    order.settleOtherwise("  virement du 3  ", STAMP);

    expect(order.toPersistence()).toMatchObject({
      state: "settled_otherwise",
      settledNote: "virement du 3",
      settledByStaffId: "staff_1",
      exclusionReason: null,
    });
  });

  it("refuse une note vide, et de régler autrement une commande déjà prélevée", () => {
    const due = OrderCollection.due("o1", 1_000, AT);
    expect(() => due.settleOtherwise("   ", STAMP)).toThrow(SettlementNoteRequiredError);

    const collected = OrderCollection.due("o2", 1_000, AT);
    collected.batch("lot", 1, AT);
    collected.collect(AT);
    expect(() => collected.settleOtherwise("virement", STAMP)).toThrow(
      OrderCollectionTransitionError,
    );
  });

  it("refuse de libérer une commande qui n'est dans aucun lot", () => {
    expect(() => OrderCollection.due("o1", 1_000, AT).release(AT)).toThrow(
      OrderCollectionTransitionError,
    );
  });
});
