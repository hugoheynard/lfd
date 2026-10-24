import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import { InMemoryDeliveryNotes } from "../../__tests__/delivery-note-doubles.js";
import { PlannedDeliveryNoteVoider } from "../planned-delivery-note-voider.js";

const PLANNED_AT = new Date(0);
const CANCELLED_AT = new Date(60_000);

const ORDER = {
  orderId: "ord_1",
  orderNumber: "ORD-7",
  lines: [
    {
      sku: "PAIN-001",
      productName: "Pain",
      unitPriceMillicents: 100_000,
      vatRate: 5.5,
      quantity: 1,
      lineTotalCents: 100,
      unitPriceTtcCents: null,
      lineTotalTtcCents: null,
    },
  ],
};

describe("PlannedDeliveryNoteVoider — la commande annulée annule son BL prévu (plan E1)", () => {
  it("passe le BL prévu `voided`, à l'instant de l'annulation, sans le supprimer", async () => {
    const notes = new InMemoryDeliveryNotes();
    await notes.save(DeliveryNote.planFromOrder("dn_1", ORDER, PLANNED_AT));

    await new PlannedDeliveryNoteVoider(notes).voidPlannedFor("ord_1", CANCELLED_AT);

    expect(notes.forOrder("ord_1")).toEqual([
      expect.objectContaining({ number: "BL-7-1", status: "voided", voidedAt: CANCELLED_AT }),
    ]);
  });

  it("sans BL, ou avec un BL déjà annulé, ne fait rien", async () => {
    const notes = new InMemoryDeliveryNotes();
    const voider = new PlannedDeliveryNoteVoider(notes);
    await voider.voidPlannedFor("ord_1", CANCELLED_AT);
    const voided = DeliveryNote.planFromOrder("dn_1", ORDER, PLANNED_AT);
    voided.void(PLANNED_AT);
    await notes.save(voided);
    const before = notes.saves;

    await voider.voidPlannedFor("ord_1", CANCELLED_AT);

    expect(notes.saves).toBe(before);
    expect(notes.forOrder("ord_1")[0]?.voidedAt).toEqual(PLANNED_AT);
  });
});
