import type { DeliveryNoteOrderProgress } from "../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { InMemoryDeliveryNotes } from "../../application/__tests__/delivery-note-doubles.js";
import { DeliveryNote } from "../../domain/entities/delivery-note.js";
import { ORDER_TERMS } from "../../domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import { ProductionDeliveryNotesBornReader } from "../production-delivery-notes-born.reader.js";

/**
 * **Les commandes encore sans BL**, que le dossier du jour attend avant de
 * partir. Instants comparés entre eux seulement, jamais à l'horloge.
 */
const PLANNED_AT = new Date(1_000);
const VOIDED_AT = new Date(2_000);

function order(orderId: string): DeliveryNoteOrderProgress {
  return {
    orderId,
    orderNumber: `ORD-${orderId}`,
    lines: [
      {
        sku: "PAIN-001",
        productName: "Pain",
        unitPriceMillicents: 100_000,
        vatRate: 5.5,
        quantity: 2,
        saleUnit: "piece",
        lineTotalCents: 200,
        unitPriceTtcCents: null,
        lineTotalTtcCents: null,
        pickupDiscountEligible: true,
      },
    ],
    status: "confirmed",
    confirmedAt: PLANNED_AT,
    readyAt: null,
    handedOverAt: null,
    receivedOn: null,
    terms: ORDER_TERMS,
  };
}

describe("ProductionDeliveryNotesBornReader", () => {
  it("rend les commandes sans BL, une fois chacune, et ignore celles qui en ont un", async () => {
    const notes = new InMemoryDeliveryNotes();
    await notes.save(DeliveryNote.planFromOrder("dn_a", order("ord_a"), PLANNED_AT));

    const reader = new ProductionDeliveryNotesBornReader(notes);

    expect(await reader.withoutNote(["ord_a", "ord_b", "ord_b"])).toEqual(["ord_b"]);
  });

  it("compte un BL annulé comme absent : le dossier n'en imprime pas", async () => {
    const notes = new InMemoryDeliveryNotes();
    const voided = DeliveryNote.planFromOrder("dn_a", order("ord_a"), PLANNED_AT);
    voided.void(VOIDED_AT);
    await notes.save(voided);

    const reader = new ProductionDeliveryNotesBornReader(notes);

    expect(await reader.withoutNote(["ord_a"])).toEqual(["ord_a"]);
  });

  it("ne lit rien quand on ne demande rien", async () => {
    const notes = new InMemoryDeliveryNotes();
    const reader = new ProductionDeliveryNotesBornReader(notes);

    expect(await reader.withoutNote([])).toEqual([]);
  });
});
