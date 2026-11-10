import {
  OrderCollectionTransitionError,
  SettlementNoteRequiredError,
} from "../../errors/collection-errors.js";
import { OrderCollection } from "../order-collection.js";

const AT = new Date("2026-10-02T09:00:00.000Z");
const STAMP = { at: AT, staffId: "staff_1" };

function collected(): OrderCollection {
  const order = OrderCollection.due("o1", 1_000, AT);
  order.batch("lot_1", 2, AT);
  order.collect(AT);
  return order;
}

describe("l'état d'encaissement d'une commande revenue de la banque (R5a)", () => {
  it("collected → returned garde sa ligne", () => {
    const order = collected();

    order.bounce(AT);

    expect(order.toPersistence()).toMatchObject({
      state: "returned",
      batchId: "lot_1",
      lineRank: 2,
    });
  });

  it("re-présentée, elle redevient due et quitte sa ligne", () => {
    const order = collected();
    order.bounce(AT);

    order.represent(AT);

    expect(order.toPersistence()).toMatchObject({ state: "due", batchId: null, lineRank: null });
  });

  it("une commande re-présentée rentre dans un lot comme une autre", () => {
    const order = collected();
    order.bounce(AT);
    order.represent(AT);

    order.batch("lot_2", 1, AT);

    expect(order.stateName).toBe("batched");
  });

  it("passée en perte, elle quitte sa ligne", () => {
    const order = collected();
    order.bounce(AT);

    order.writeOff(AT);

    expect(order.toPersistence()).toMatchObject({ state: "written_off", batchId: null });
  });

  it("réglée autrement après un retour, avec la note", () => {
    const order = collected();
    order.bounce(AT);

    order.settleReturned(" virement reçu ", STAMP);

    expect(order.toPersistence()).toMatchObject({
      state: "settled_otherwise",
      batchId: null,
      settledNote: "virement reçu",
      settledByStaffId: "staff_1",
    });
  });

  it("refuse une note vide", () => {
    const order = collected();
    order.bounce(AT);

    expect(() => order.settleReturned("  ", STAMP)).toThrow(SettlementNoteRequiredError);
  });

  it("une commande non prélevée ne revient pas de la banque", () => {
    const order = OrderCollection.due("o1", 1_000, AT);
    order.batch("lot_1", 1, AT);

    expect(() => order.bounce(AT)).toThrow(OrderCollectionTransitionError);
  });

  it("une commande retournée ne se règle pas seule par le geste de la commande", () => {
    const order = collected();
    order.bounce(AT);

    expect(() => order.settleOtherwise("virement", STAMP)).toThrow(OrderCollectionTransitionError);
  });

  it("une commande prélevée ne se re-présente ni ne se perd sans retour", () => {
    const order = collected();

    expect(() => order.represent(AT)).toThrow(OrderCollectionTransitionError);
    expect(() => order.writeOff(AT)).toThrow(OrderCollectionTransitionError);
  });
});
