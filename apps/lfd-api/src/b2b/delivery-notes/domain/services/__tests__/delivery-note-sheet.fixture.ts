import { DeliveryNote, type DeliveryNoteState } from "../../entities/delivery-note.js";
import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import type { DeliveryNoteOrderBilling, DeliveryNoteOrderHead } from "../delivery-note-sheet.js";

/** Des BL construits par l'agrégat, et la commande qui les porte. */

export const PLANNED_AT = new Date(0);
export const HANDED_OVER_AT = new Date(86_400_000);

export const BREAD: DeliveryNoteSourceLine = {
  sku: "PAIN-001",
  productName: "Pain de campagne",
  unitPriceMillicents: 412_345,
  vatRate: 5.5,
  quantity: 12,
  lineTotalCents: 49_481,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};

export const CROISSANT: DeliveryNoteSourceLine = {
  sku: "VIEN-002",
  productName: "Croissant",
  unitPriceMillicents: 95_000,
  vatRate: 5.5,
  quantity: 6,
  lineTotalCents: 5_700,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: false,
};

/** La TVA par taux telle qu'`orders` l'écrit vraiment (`prisma-order.repository.ts`). */
export const VAT_SHARES = [{ rate: 5.5, amountCents: 2_998 }];

export function plannedNote(): DeliveryNote {
  return DeliveryNote.planFromOrder(
    "dn_1",
    {
      orderId: "ord_1",
      orderNumber: "ORD-1042",
      lines: [BREAD, CROISSANT],
      terms: { ...ORDER_TERMS, vatShares: VAT_SHARES },
    },
    PLANNED_AT,
  );
}

export function handedOverNote(): DeliveryNoteState {
  const note = plannedNote();
  note.handOver(HANDED_OVER_AT, "1970-01-02");
  return note.toState();
}

export const HEAD: DeliveryNoteOrderHead = {
  orderId: "ord_1",
  reference: "ORD-1042",
  placedAt: "1970-01-01T00:00:00.000Z",
  requestedFor: "1970-01-02",
  customer: { tradeName: "Hôtel des Trois Ponts", legalName: "SARL Trois Ponts" },
  fulfillment: {
    method: "delivery",
    address: {
      label: "Hôtel",
      ligne1: "3 quai des Ponts",
      ligne2: "",
      codePostal: "75004",
      ville: "Paris",
      pays: "FR",
    },
    pickupLabel: null,
    window: null,
    contact: { source: "order", name: "Jeanne Martin", phone: "06 00 00 00 00" },
    signatureRequired: true,
  },
  note: "Entrée de service.",
};

export const PRO_BILLING: DeliveryNoteOrderBilling = {
  variant: "pro",
  customerPhone: "06 11 11 11 11",
  money: { discountAdjustment: null, currency: "EUR", settlement: "account" },
};
