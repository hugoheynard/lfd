import { DeliveryNote, type DeliveryNoteSource } from "../delivery-note.js";
import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";

// Instants comparés entre eux, jamais à l'horloge.
const T0 = new Date(0);
const T1 = new Date(1_000);

const SOURCE: DeliveryNoteSource = {
  orderId: "ord_1",
  orderNumber: "ORD-0001",
  lines: [
    {
      sku: "CRO",
      productName: "Croissant",
      unitPriceMillicents: 100_000,
      vatRate: 5.5,
      quantity: 10,
      lineTotalCents: 1_000,
      unitPriceTtcCents: null,
      lineTotalTtcCents: null,
      pickupDiscountEligible: true,
    },
  ],
  terms: ORDER_TERMS,
};

const LINE = SOURCE.lines[0];
const SIX: DeliveryNoteSource = {
  ...SOURCE,
  lines: LINE === undefined ? [] : [{ ...LINE, quantity: 6, lineTotalCents: 600 }],
};

describe("DeliveryNote — le papier et sa version (plan E6, § 14)", () => {
  it("le chemin normal — prévu, imprimé, préparé, remis — ne demande jamais de réimprimer", () => {
    const note = DeliveryNote.planFromOrder("dn_1", SOURCE, T0);
    note.recordPrint(T0, "staff_1");
    note.replanFrom(SOURCE); // un réalignement qui ne change rien
    note.prepare(T1);
    note.handOver(T1, "2030-01-10");

    expect(note.reprintNeeded).toBe(false);
    expect(note.toState().contentVersion).toBe(1);
  });

  it("jamais imprimé : rien, même après un changement", () => {
    const note = DeliveryNote.planFromOrder("dn_1", SOURCE, T0);
    note.replanFrom(SIX);
    expect(note.toState().contentVersion).toBe(2);
    expect(note.reprintNeeded).toBe(false);
  });

  it("imprimé puis changé : à réimprimer ; réimprimé : l'avertissement disparaît", () => {
    const note = DeliveryNote.planFromOrder("dn_1", SOURCE, T0);
    note.recordPrint(T0, "staff_1");
    note.replanFrom(SIX);
    expect(note.reprintNeeded).toBe(true);

    note.recordPrint(T1, "staff_2");
    expect(note.reprintNeeded).toBe(false);
    expect(note.toState().printed).toEqual({ version: 2, at: T1, by: "staff_2" });
  });
});
