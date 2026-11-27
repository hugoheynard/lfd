import { specimenClientSheet } from "../../../orders/application/document-specimens/specimen-data.js";
import { DeliveryNote, type DeliveryNoteState } from "../../domain/entities/delivery-note.js";
import type {
  DeliveryNoteOrderBilling,
  DeliveryNoteOrderHead,
} from "../../domain/services/delivery-note-sheet.js";

/** Le numéro de la commande d'exemple, sous la forme qu'un BL sait numéroter. */
const SPECIMEN_ORDER_NUMBER = "ORD-EXEMPLE-0001";
const SPECIMEN_NOTE_ID = "specimen-delivery-note";
/** L'option de l'exemple : deux pièces de la première ligne, tranchées. */
const SPECIMEN_OPTION = {
  group: "tranchage",
  groupName: "Tranchage",
  choice: "tranche",
  choiceLabel: "tranché",
  quantity: 2,
  position: 0,
} as const;

/** Un BL d'exemple et la commande qui le porte — ce que la planche imprime. */
export interface SpecimenDeliveryNote {
  readonly note: DeliveryNoteState;
  readonly head: DeliveryNoteOrderHead;
  readonly billing: DeliveryNoteOrderBilling;
}

/**
 * **Le BL de la planche des documents** (plan E5a, § 3) : prévu par l'agrégat
 * lui-même (`DeliveryNote.planFromOrder`) à partir du bon de commande pro
 * d'exemple — mêmes lignes, mêmes totaux, au centime. Rien n'est écrit.
 */
export function specimenDeliveryNote(now: Date): SpecimenDeliveryNote {
  const sheet = specimenClientSheet("pro", now);
  const { money } = sheet;
  const note = DeliveryNote.planFromOrder(
    SPECIMEN_NOTE_ID,
    {
      orderId: sheet.orderId,
      orderNumber: SPECIMEN_ORDER_NUMBER,
      lines: sheet.lines.map((line, index) => ({
        sku: line.sku,
        productName: line.productName,
        unitPriceMillicents: line.unitPriceMillicents,
        vatRate: line.vatRate,
        quantity: line.quantity,
        saleUnit: line.saleUnit ?? "piece",
        lineTotalCents: line.lineTotalCents,
        unitPriceTtcCents: line.unitPriceTtcCents,
        lineTotalTtcCents: line.lineTotalTtcCents,
        pickupDiscountEligible: line.pickupDiscountEligible !== false,
        // La première ligne porte une option : « Tranchage : 2 × tranché »
        // doit se lire sur la planche (`plan-options-de-commande.md`, § 3.4).
        ...(index === 0 && line.saleUnit !== "weight" && line.quantity > 2
          ? { optionChoices: [SPECIMEN_OPTION] }
          : {}),
      })),
      terms: {
        subtotalCents: money.subtotalCents,
        ttcTerms: null,
        discountCents: money.discountCents,
        voucherDiscountCents: money.voucherDiscountCents,
        deliveryFeeCents: money.deliveryFeeCents,
        deliveryVatMode: null,
        lateFeeCents: money.lateFeeCents,
        lateFeeAdjustment: null,
        vatShares: money.vatShares === null ? null : money.vatShares.map((s) => ({ ...s })),
        vatCents: money.vatCents,
        totalCents: money.totalCents,
      },
    },
    now,
  );
  return {
    note: note.toState(),
    head: {
      orderId: sheet.orderId,
      reference: SPECIMEN_ORDER_NUMBER,
      placedAt: sheet.placedAt,
      requestedFor: sheet.requestedFor,
      customer: sheet.customer,
      fulfillment: sheet.fulfillment,
      note: sheet.note,
    },
    billing: { variant: sheet.variant, customerPhone: sheet.customerPhone, money },
  };
}
