import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type {
  DeliveryNoteOrder,
  DeliveryNoteOrderLine,
} from "../../../../orders/domain/ports/order-lines-for-delivery-note.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import {
  FixedConfirmedOrders,
  InMemoryDeliveryNotes,
} from "../../__tests__/delivery-note-doubles.js";
import { DeliveryNotePlanner } from "../delivery-note-planner.js";

/** Les instants ne sont comparés qu'entre eux (marqueur d'arrêt), jamais à l'horloge. */
const CLOSED_AT = new Date(0);
const RECLOSED_AT = new Date(60_000);
const NOW = new Date(120_000);

const BREAD: DeliveryNoteOrderLine = {
  sku: "PAIN-001",
  productName: "Pain de campagne",
  unitPriceMillicents: 412_345,
  vatRate: 5.5,
  quantity: 12,
  lineTotalCents: 49_481,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
};

function orderOf(id: string, number: string, lines = [BREAD]): DeliveryNoteOrder {
  return { orderId: id, orderNumber: number, lines };
}

function scene() {
  const orders = new FixedConfirmedOrders();
  const notes = new InMemoryDeliveryNotes();
  const planner = new DeliveryNotePlanner(
    orders,
    notes,
    new FixedIdGenerator("dn"),
    new FixedClock(NOW),
  );
  return { orders, notes, planner };
}

describe("DeliveryNotePlanner — le BL prévu à l'arrêt du plan (plan E1)", () => {
  it("prévoit le BL-1 de chaque commande que CET arrêt a confirmée, lignes égales", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1042"), CLOSED_AT);

    await planner.planConfirmed(["ord_1"], CLOSED_AT);

    expect(notes.forOrder("ord_1")).toEqual([
      {
        id: "dn_000001",
        orderId: "ord_1",
        rank: 1,
        number: "BL-1042-1",
        status: "planned",
        plannedAt: NOW,
        voidedAt: null,
        lines: [BREAD],
      },
    ]);
  });

  it("une commande de l'instantané que l'arrêt n'a pas confirmée (planWhere) n'a pas de BL", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1"), CLOSED_AT);

    await planner.planConfirmed(["ord_1", "ord_filtered"], CLOSED_AT);

    expect(notes.forOrder("ord_filtered")).toEqual([]);
    expect(notes.forOrder("ord_1")).toHaveLength(1);
  });

  it("une seconde livraison du même fait ne crée rien de plus", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1"), CLOSED_AT);

    await planner.planConfirmed(["ord_1"], CLOSED_AT);
    await planner.planConfirmed(["ord_1"], CLOSED_AT);

    expect(notes.forOrder("ord_1")).toHaveLength(1);
  });

  it("une re-clôture après réouverture RÉÉCRIT le BL-1 prévu : même id, même numéro", async () => {
    const { orders, notes, planner } = scene();
    orders.confirm(orderOf("ord_1", "ORD-1"), CLOSED_AT);
    await planner.planConfirmed(["ord_1"], CLOSED_AT);
    const revised = { ...BREAD, quantity: 3, lineTotalCents: 12_370 };
    orders.confirm(orderOf("ord_1", "ORD-1", [revised]), RECLOSED_AT);

    await planner.planConfirmed(["ord_1"], RECLOSED_AT);

    expect(notes.forOrder("ord_1")).toEqual([
      expect.objectContaining({ id: "dn_000001", number: "BL-1-1", lines: [revised] }),
    ]);
  });

  it("un BL annulé n'est ni réécrit ni remplacé : son numéro n'est jamais réemployé", async () => {
    const { orders, notes, planner } = scene();
    const voided = DeliveryNote.planFromOrder("dn_old", orderOf("ord_1", "ORD-1"), CLOSED_AT);
    voided.void(CLOSED_AT);
    await notes.save(voided);
    orders.confirm(orderOf("ord_1", "ORD-1"), RECLOSED_AT);
    const before = notes.saves;

    await planner.planConfirmed(["ord_1"], RECLOSED_AT);

    expect(notes.saves).toBe(before);
    expect(notes.forOrder("ord_1")).toEqual([voided.toState()]);
  });

  it("sans commande confirmée, ne lit même pas les BL", async () => {
    const { notes, planner } = scene();

    await planner.planConfirmed(["ord_1"], CLOSED_AT);

    expect(notes.saves).toBe(0);
  });
});
