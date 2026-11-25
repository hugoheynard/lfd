import type { DeliveryNoteOrderBilling } from "../delivery-note-sheet.js";
import { clientNoteOf, staffNoteOf } from "../delivery-note-sheet.js";
import { totalRows } from "../../../../orders/domain/services/order-sheet-pdf-totals.js";
import { money } from "../../../../orders/domain/services/order-sheet-pdf-format.js";
import { handedOverNote, HEAD, PRO_BILLING } from "./delivery-note-sheet.fixture.js";

/** La livraison offerte sur le bon de livraison chiffré (frais-et-livraison-offerte.md). */

const WAIVED = 1_200;

const OFFERED: DeliveryNoteOrderBilling = {
  ...PRO_BILLING,
  money: {
    ...PRO_BILLING.money,
    freeDelivery: {
      waivedCents: WAIVED,
      waivedTtcCents: null,
      label: { fr: "Port offert Labo", en: "Labo free delivery", it: "Consegna gratuita Labo" },
    },
  },
};

describe("le bon de livraison et la livraison offerte", () => {
  it("le BL porte la ligne de la promotion, au barème figé, sans bouger un total", () => {
    const state = handedOverNote();
    const note = clientNoteOf(state, HEAD, OFFERED);
    const plain = clientNoteOf(state, HEAD, PRO_BILLING);

    expect(note.money.freeDelivery).toEqual(OFFERED.money.freeDelivery);
    expect(note.money.totalCents).toBe(plain.money.totalCents);
    expect(totalRows(note)).toEqual(
      expect.arrayContaining([
        { label: "Livraison", value: money(WAIVED) },
        { label: "Port offert Labo", value: money(-WAIVED) },
      ]),
    );
    expect(staffNoteOf(state, HEAD, OFFERED).money?.freeDelivery).toEqual(
      OFFERED.money.freeDelivery,
    );
  });

  it("sans livraison offerte, le bon est celui d'aujourd'hui", () => {
    expect(clientNoteOf(handedOverNote(), HEAD, PRO_BILLING).money).not.toHaveProperty(
      "freeDelivery",
    );
  });
});
